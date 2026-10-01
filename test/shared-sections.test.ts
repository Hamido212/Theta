import { expect, test } from "bun:test";
import sharp from "sharp";
import { type Block, parseBlocks } from "../src/blocks";
import { exportSite } from "../src/export";
import { expandSharedSections } from "../src/shared-sections";
import { blockRange, copyBlocks, duplicateBlocks, stepBlocks } from "../src/editor/sections";
import { form, testSite } from "./helpers";

const content = (text: string): Block[] => [{ id: "band", type: "section", background: "accent", width: "wide" }, { id: "body", type: "text", text }];
const reference = (sectionId: string, id = "ref"): Block => ({ id, type: "shared", sectionId });
const json = (body: unknown, method = "POST") => ({ method, headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body) });

test("central sections require authentication and CSRF protection and have no public page", async () => {
  const { app, request, pages } = await testSite({ login: true });
  expect((await app.request("/api/shared-sections")).status).toBe(401);
  expect((await app.request("/api/shared-sections", json({ title: "Kontakt", blocks: content("Live") }))).status).toBe(401);
  expect((await app.request("/admin/shared-sections")).status).toBe(302);
  expect((await request("/api/shared-sections", { ...json({ title: "Kontakt", blocks: content("Live") }), headers: { "content-type": "application/json", origin: "https://evil.test" } })).status).toBe(403);
  const response = await request("/api/shared-sections", json({ title: "Kontaktaufruf", blocks: content("Live") }));
  expect(response.status).toBe(201);
  const { page } = await response.json() as { page: { slug: string } };
  pages.publish(page.slug, true);
  expect((await app.request(`/${page.slug}`)).status).toBe(404);
  expect((await request(`/edit/${page.slug}`)).status).toBe(200);
  expect(pages.list().some((item) => item.slug === page.slug)).toBe(false);
  expect(pages.nav().some((item) => item.slug === page.slug)).toBe(false);
  expect(await (await app.request("/sitemap.xml")).text()).not.toContain(page.slug);
});

test("central drafts stay private; publication changes every embedding and static export", async () => {
  const site = await testSite({ login: true });
  const shared = site.pages.createShared("Projektanfrage", content("Gemeinsam LIVE"));
  site.pages.publish(shared.slug, true);
  const parents = [site.pages.create("Leistungen"), site.pages.create("Beitrag", "", "post")];
  for (const parent of parents) {
    site.pages.save(parent.slug, { blocks: [reference(shared.slug)] });
    site.pages.publish(parent.slug, true);
  }
  site.pages.save(shared.slug, { blocks: content("GEHEIMER zentraler Entwurf") });
  for (const path of [`/${parents[0]!.slug}`, `/blog/${parents[1]!.slug}`, `/admin/preview/${parents[0]!.slug}`]) {
    const html = await (await site.request(path)).text();
    expect(html).toContain("Gemeinsam LIVE"); expect(html).not.toContain("GEHEIMER"); expect(html).not.toContain("<script");
  }
  let files = await exportSite(site, "https://theta.test");
  expect(new TextDecoder().decode(files.get(`${parents[0]!.slug}/index.html`))).toContain("Gemeinsam LIVE");
  expect(files.has(`${shared.slug}/index.html`)).toBe(false);
  expect(await (await site.request(`/admin/preview/${shared.slug}`)).text()).toContain("GEHEIMER zentraler Entwurf");
  site.pages.publish(shared.slug, true);
  expect(await (await site.request(`/${parents[0]!.slug}`)).text()).toContain("GEHEIMER zentraler Entwurf");
  expect(await (await site.request(`/blog/${parents[1]!.slug}`)).text()).toContain("GEHEIMER zentraler Entwurf");
  files = await exportSite(site, "https://theta.test");
  expect(new TextDecoder().decode(files.get(`${parents[0]!.slug}/index.html`))).toContain("GEHEIMER zentraler Entwurf");
  expect(site.pages.sharedUsage(shared.slug).map((item) => item.slug).sort()).toEqual(parents.map((item) => item.slug).sort());
});

test("invalid, unpublished and nested references fail without changing publication", async () => {
  const { pages, request } = await testSite({ login: true });
  const parent = pages.create("Elternseite");
  const shared = pages.createShared("Kontaktaufruf", content("Noch privat"));
  for (const sectionId of ["missing", parent.slug]) expect(() => pages.save(parent.slug, { blocks: [reference(sectionId)] })).toThrow();
  pages.save(parent.slug, { blocks: [reference(shared.slug)] });
  expect(() => pages.publish(parent.slug, true)).toThrow("Veröffentliche zuerst");
  expect(pages.live(parent.slug)).toBeNull();
  const before = pages.get(shared.slug)!;
  const invalid = await request(`/api/pages/${shared.slug}`, json({ version: before.version, blocks: [...content("Verschachtelt"), reference(shared.slug)] }, "PUT"));
  expect(invalid.status).toBe(400);
  expect(pages.get(shared.slug)).toEqual(before);
  expect(() => parseBlocks([reference("../admin")])).toThrow();
  for (const blocks of [[], [{ id: "text", type: "text", text: "Kein Abschnitt" }], [...content("Zwei"), { id: "next", type: "section", background: "plain" }], [...content("Titel"), { id: "title", type: "heading", text: "Seitentitel", level: 1 }]]) {
    expect((await request("/api/shared-sections", json({ title: "Ungültig", blocks }))).status).toBe(400);
  }
});

test("shared images export their responsive files and remain protected through history and trash", async () => {
  const site = await testSite({ login: true });
  const pixels = await sharp({ create: { width: 1000, height: 600, channels: 3, background: "#176b66" } }).png().toBuffer();
  const image = await site.media.add(new File([pixels], "section.png"));
  const shared = site.pages.createShared("Projektfoto", [...content("Mit Foto"), { id: "photo", type: "image", src: image.url, alt: "Projektfoto", caption: "", width: "normal" }]);
  site.pages.publish(shared.slug, true);
  const parent = site.pages.create("Projekte");
  site.pages.save(parent.slug, { blocks: [reference(shared.slug)] });
  site.pages.publish(parent.slug, true);
  // Removing the image from a central draft must not remove the published asset.
  site.pages.save(shared.slug, { blocks: content("Ohne Foto") });
  const files = await exportSite(site, "https://theta.test");
  const html = new TextDecoder().decode(files.get(`${parent.slug}/index.html`));
  expect(html).toContain(image.url);
  expect(html).toContain(`/media/${image.id}/480.webp 480w`);
  for (const file of [image.url.slice(1), `media/${image.id}/480.webp`, `media/${image.id}/960.webp`]) expect(files.get(file)?.length).toBeGreaterThan(0);
  expect((await site.request(`/admin/media/${image.id}/delete`, form({}))).status).toBe(400);
  site.pages.publish(shared.slug, true);
  expect(await (await site.request(`/${parent.slug}`)).text()).not.toContain(image.url);
  // The original image remains recoverable from central history and soft trash.
  expect((await site.request(`/admin/media/${image.id}/delete`, form({}))).status).toBe(400);
  site.pages.delete(parent.slug);
  site.pages.delete(shared.slug);
  expect((await site.request(`/admin/media/${image.id}/delete`, form({}))).status).toBe(400);
  expect(site.media.get(image.id)).not.toBeNull();
});

test("central changes use version conflicts, history and recoverable deletion", async () => {
  const { pages, request } = await testSite({ login: true });
  const shared = pages.createShared("Kontaktaufruf", content("Vorher"));
  const changed = await request(`/api/pages/${shared.slug}`, json({ version: shared.version, blocks: content("Nachher") }, "PUT"));
  expect(changed.status).toBe(200);
  const saved = pages.get(shared.slug)!;
  expect((await request(`/api/pages/${shared.slug}`, json({ version: shared.version, action: "publish" }, "PUT"))).status).toBe(409);
  expect(pages.live(shared.slug)).toBeNull();
  expect(pages.revision(shared.slug, pages.revisions(shared.slug)[1]!.id)!.blocks).toEqual(content("Vorher"));
  pages.delete(shared.slug, saved.version);
  const restored = pages.restore(shared.slug, pages.trash()[0]!.version);
  expect(restored).toMatchObject({ kind: "section", publishedAt: null, blocks: content("Nachher") });
});

test("draft and live embeddings protect a shared section until copies are published", async () => {
  const { pages, request } = await testSite({ login: true });
  const shared = pages.createShared("Kontaktaufruf", content("Original"));
  pages.publish(shared.slug, true);
  const parent = pages.create("Kontakt");
  pages.save(parent.slug, { blocks: [reference(shared.slug)] });
  expect(() => pages.delete(shared.slug)).toThrow("verwendet");
  pages.publish(parent.slug, true);
  const copies = copyBlocks(pages.live(shared.slug)!.blocks);
  pages.save(parent.slug, { blocks: copies });
  expect(() => pages.delete(shared.slug)).toThrow("verwendet");
  expect(() => pages.publish(shared.slug, false)).toThrow("verwendet");
  expect((await request(`/admin/shared-sections/${shared.slug}/delete`, form({ version: String(pages.get(shared.slug)!.version) }))).status).toBe(400);
  pages.publish(parent.slug, true);
  expect(pages.sharedUsage(shared.slug)).toEqual([]);
  pages.save(shared.slug, { blocks: content("Neue zentrale Fassung") });
  pages.publish(shared.slug, true);
  expect(pages.live(parent.slug)!.blocks).toEqual(copies);
  pages.delete(shared.slug);
  expect(pages.get(shared.slug)).toBeNull();
});

test("repeated references get unique ids and preserve surrounding band choices", () => {
  const blocks: Block[] = [{ id: "outer", type: "section", background: "inverse", width: "full", spacing: "compact", align: "center" }, { id: "before", type: "text", text: "Davor" }, reference("contact", "one"), { id: "after", type: "text", text: "Danach" }, reference("contact", "two")];
  const expanded = expandSharedSections(blocks, { contact: content("Gemeinsam") });
  expect(new Set(expanded.map((block) => block.id)).size).toBe(expanded.length);
  expect(expanded[4]).toMatchObject({ type: "section", background: "inverse", width: "full", spacing: "compact", align: "center" });
  expect(blockRange(blocks, 0)).toEqual([0, 2]);
  expect(stepBlocks(blocks, 0, 1).map((block) => block.id)).toEqual(["one", "after", "outer", "before", "two"]);
  const duplicate = duplicateBlocks([reference("contact")], 0);
  expect(duplicate).toHaveLength(2);
  expect(duplicate[1]).toMatchObject({ type: "shared", sectionId: "contact" });
  expect(duplicate[1]!.id).not.toBe("ref");
});
