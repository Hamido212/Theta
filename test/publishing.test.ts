import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { openDatabase } from "../src/db";
import { exportSite } from "../src/export";
import { ConflictError, PageStore } from "../src/store";
import { form, testSite } from "./helpers";

const text = (value: string) => [{ id: "text", type: "text" as const, text: value }];
const put = (body: unknown) => ({ method: "PUT", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body) });

describe("publication snapshots", () => {
  test("a version-6 website stays live, including legacy blocks; draft posts stay private", () => {
    const path = join(mkdtempSync(join(tmpdir(), "theta-migration-")), "site.db");
    const old = new Database(path);
    old.run(`CREATE TABLE pages (slug TEXT PRIMARY KEY, title TEXT, description TEXT, in_nav INTEGER, position INTEGER,
      blocks TEXT, updated_at TEXT, kind TEXT, published_at TEXT);
      CREATE TABLE revisions (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, description TEXT, in_nav INTEGER, blocks TEXT, author TEXT, created_at TEXT);
      PRAGMA user_version = 6`);
    const insert = old.query("INSERT INTO pages VALUES (?, ?, '', 1, 0, ?, '2026-09-01T10:00:00Z', ?, ?)");
    insert.run("home", "Bestehende Website", JSON.stringify([{ id: "h", type: "heading", text: "Bisheriger Inhalt" }]), "page", null);
    insert.run("live-post", "Öffentlicher Beitrag", "[]", "post", "2026-09-02T10:00:00Z");
    insert.run("draft-post", "Privater Beitrag", "[]", "post", null);
    old.close();
    const db = openDatabase(path);
    const pages = new PageStore(db);
    expect(pages.live("home")).toMatchObject({ title: "Bestehende Website", hasChanges: false, version: 1, blocks: [{ id: "h", type: "heading", text: "Bisheriger Inhalt", level: 1 }] });
    expect(pages.get("home")!.hasChanges).toBe(false);
    expect(pages.post("live-post")!.publishedAt).toBe("2026-09-02T10:00:00Z");
    expect(pages.live("draft-post")).toBeNull();
    db.close();
    const reopened = openDatabase(path);
    expect(new PageStore(reopened).live("home")!.version).toBe(1);
    reopened.close();
  });

  test("draft title, content and navigation do not leak through public HTML, feed or export", async () => {
    const site = await testSite({ login: true });
    const page = site.pages.create("Öffentliche Seite");
    site.pages.save(page.slug, { blocks: text("Veröffentlichter Text"), description: "Live-Beschreibung" });
    site.pages.publish(page.slug, true);
    const post = site.pages.create("Öffentlicher Beitrag", "", "post");
    site.pages.save(post.slug, { blocks: text("Veröffentlichter Beitrag") });
    site.pages.publish(post.slug, true);
    site.pages.save(page.slug, { title: "GEHEIMER TITEL", description: "GEHEIME BESCHREIBUNG", inNav: false, blocks: text("GEHEIMER TEXT") });
    site.pages.save(post.slug, { title: "GEHEIMER BEITRAG", blocks: text("GEHEIMER ENTWURF") });
    const privatePage = site.pages.create("Private Seite");
    expect((await site.request(`/${privatePage.slug}`)).status).toBe(404);
    for (const route of ["/", `/${page.slug}`, "/blog", `/blog/${post.slug}`, "/blog/feed.xml", "/sitemap.xml"]) {
      const response = await site.request(route);
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain("GEHEIM");
    }
    expect(site.pages.nav()).toContainEqual({ slug: page.slug, title: "Öffentliche Seite" });
    const files = await exportSite(site, "https://theta.test");
    expect(files.has(`${privatePage.slug}/index.html`)).toBe(false);
    for (const [path, bytes] of files) if (path.endsWith("html") || path.endsWith("xml")) expect(new TextDecoder().decode(bytes)).not.toContain("GEHEIM");
    expect(site.pages.get(page.slug)!.hasChanges).toBe(true);
    site.pages.publish(page.slug, true);
    expect(await (await site.request(`/${page.slug}`)).text()).toContain("GEHEIMER TEXT");
    expect(site.pages.nav().some((p) => p.slug === page.slug)).toBe(false);
    expect(site.pages.get(page.slug)!.hasChanges).toBe(false);
  });

  test("stale save and publication fail without changing draft, live copy or history", async () => {
    const { request, pages } = await testSite({ login: true });
    const page = pages.create("Konflikt");
    const first = await request(`/api/pages/${page.slug}`, put({ version: page.version, title: "Tab A", blocks: text("A") }));
    expect(first.status).toBe(200);
    const saved = pages.get(page.slug)!;
    const history = pages.revisions(page.slug);
    for (const action of ["save", "publish", "unpublish"]) {
      const stale = await request(`/api/pages/${page.slug}`, put({ version: page.version, action, title: "Tab B", blocks: text("B") }));
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ conflict: true });
      expect(pages.get(page.slug)).toEqual(saved);
      expect(pages.revisions(page.slug)).toEqual(history);
      expect(pages.live(page.slug)).toBeNull();
    }
    expect((await request(`/api/pages/${page.slug}`, put({ title: "Ohne Version" }))).status).toBe(400);
    const publication = await request(`/api/pages/${page.slug}`, put({ version: saved.version, action: "publish" }));
    expect(publication.status).toBe(200);
    expect(pages.live(page.slug)!.blocks).toEqual(text("A"));
  });

  test("a forbidden home unpublication rolls back the associated draft changes", async () => {
    const { pages } = await testSite();
    const home = pages.get("home")!;
    expect(() => pages.save("home", { title: "Falsch" }, "", { version: home.version, action: "unpublish" })).toThrow();
    expect(pages.get("home")).toEqual(home);
  });

  test("preview requires login, shows the saved draft and cannot be cached or indexed", async () => {
    const { app, request, pages } = await testSite({ login: true });
    const page = pages.create("Privat");
    pages.save(page.slug, { blocks: text("Privater Entwurf") });
    expect((await app.request(`/admin/preview/${page.slug}`)).status).toBe(302);
    const preview = await request(`/admin/preview/${page.slug}`);
    expect(await preview.text()).toContain("Privater Entwurf");
    expect(preview.headers.get("cache-control")).toContain("no-store");
    expect(preview.headers.get("x-robots-tag")).toContain("noindex");
    expect((await request(`/edit/${page.slug}`)).headers.get("cache-control")).toContain("no-store");
  });

  test("autosaves coalesce but publication, manual saves and other authors preserve checkpoints", async () => {
    const { pages } = await testSite();
    const page = pages.create("Verlauf", "Anna");
    pages.save(page.slug, { title: "Eins" }, "Anna", { autosave: true });
    pages.save(page.slug, { title: "Zwei" }, "Anna", { autosave: true });
    expect(pages.revisions(page.slug)).toHaveLength(2);
    pages.publish(page.slug, true);
    pages.save(page.slug, { title: "Drei" }, "Anna", { autosave: true });
    pages.save(page.slug, { title: "Vier" }, "Ben", { autosave: true });
    pages.save(page.slug, { title: "Fünf" }, "Ben");
    pages.save(page.slug, { title: "Sechs" }, "Ben", { autosave: true });
    expect(pages.revisions(page.slug).map((r) => r.title)).toEqual(["Sechs", "Fünf", "Vier", "Drei", "Zwei", "Verlauf"]);
  });

  test("trash removes public routes and blog navigation, reserves addresses and restores privately", async () => {
    const { pages, request } = await testSite({ login: true });
    const post = pages.create("Neuigkeiten", "", "post");
    const live = pages.publish(post.slug, true);
    pages.delete(post.slug, live.version);
    expect(pages.posts()).toHaveLength(0);
    expect(pages.nav().some((item) => item.slug === "blog")).toBe(false);
    expect((await request(`/blog/${post.slug}`)).status).toBe(404);
    expect(pages.create("Neuigkeiten").slug).toBe("neuigkeiten-2");
    const trashed = pages.trash()[0]!;
    expect(() => pages.restore(post.slug, live.version)).toThrow(ConflictError);
    const response = await request(`/admin/trash/${post.slug}/restore`, form({ version: String(trashed.version) }));
    expect(response.status).toBe(302);
    expect(pages.get(post.slug)).toMatchObject({ publishedAt: null, deletedAt: null, hasChanges: true });
    expect(pages.revisions(post.slug)).toHaveLength(1);
    expect(pages.live(post.slug)).toBeNull();
  });

  test("live snapshots, history, trash and section templates protect their uploaded media", async () => {
    const { pages, media, settings, request } = await testSite({ login: true });
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
    const item = await media.add(new File([bytes], "bild.png"));
    const block = { id: "image", type: "image" as const, src: item.url, alt: "Rot", caption: "", width: "normal" as const };
    const page = pages.create("Bildseite");
    pages.save(page.slug, { blocks: [block] });
    pages.publish(page.slug, true);
    pages.save(page.slug, { blocks: [] });
    const deletion = () => request(`/admin/media/${item.id}/delete`, form({}));
    expect((await deletion()).status).toBe(400);
    pages.publish(page.slug, false);
    expect((await deletion()).status).toBe(400);
    pages.delete(page.slug);
    expect((await deletion()).status).toBe(400);
    settings.saveTemplate("Bilder", [{ id: "section", type: "section", background: "plain" }, block]);
    // Isolate the template from the other references to test its own protection.
    pages.restore(page.slug);
    for (let i = 0; i < 51; i++) pages.save(page.slug, { title: `Fassung ${i}` });
    expect((await deletion()).status).toBe(400);
    settings.deleteTemplate(settings.templates()[0]!.id);
    expect((await deletion()).status).toBe(302);
  });
});
