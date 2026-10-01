import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import { AuthStore } from "../src/auth";
import { BackupError, Backups } from "../src/backup";
import { migrations, openDatabase } from "../src/db";
import { MediaStore } from "../src/media";
import { PageStore } from "../src/store";
import { zip } from "../src/zip";
import { SETUP_TOKEN, form, testSite } from "./helpers";

const photo = async () =>
  new File([await sharp({ create: { width: 800, height: 600, channels: 3, background: "#c2410c" } }).jpeg().toBuffer()], "foto.jpg");

// A site with a published page, a draft, an image, a message and an account.
async function filledSite() {
  const site = await testSite({ login: true });
  const page = site.pages.create("Über uns", "Test");
  const image = await site.media.add(await photo());
  site.pages.save(page.slug, { blocks: [{ id: "a", type: "image", src: image.url, alt: "Laden", caption: "", width: "normal" }] }, "Test", { action: "publish" });
  site.pages.save(page.slug, { blocks: [{ id: "a", type: "text", text: "Entwurf" }] }, "Test");
  site.settings.saveSite({ ...site.settings.site(), name: "Café Morgenrot" });
  site.contact.add({ slug: "home", title: "Start" }, { name: "Lea", email: "lea@example.com", phone: "", message: "Hallo" });
  return { ...site, page, image };
}

const restoreForm = (file: Uint8Array, fields: Record<string, string>) => {
  const body = new FormData();
  body.set("file", new File([new Uint8Array(file)], "sicherung.zip", { type: "application/zip" }));
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return { method: "POST", headers: { origin: "http://localhost" }, body };
};

describe("backups", () => {
  test("a backup brings drafts, history, images, messages and accounts to a fresh site", async () => {
    const source = await filledSite();
    const archive = source.backups.create();
    const entries = unzipSync(archive);
    expect(JSON.parse(strFromU8(entries["theta-backup.json"]!))).toMatchObject({ format: 1, schema: migrations.length, site: "Café Morgenrot" });
    expect(Object.keys(entries).some((name) => name.startsWith(`uploads/${source.image.id}/`))).toBe(true);

    const target = await testSite();
    const result = target.backups.restore(archive);
    expect(result.media).toBe(1);

    expect(target.settings.site().name).toBe("Café Morgenrot");
    expect(target.pages.live(source.page.slug)!.blocks[0]).toMatchObject({ type: "image", src: source.image.url });
    expect(target.pages.get(source.page.slug)!.blocks[0]).toMatchObject({ text: "Entwurf" });
    expect(target.pages.revisions(source.page.slug).length).toBe(source.pages.revisions(source.page.slug).length);
    expect(target.contact.list().map((message) => message.name)).toEqual(["Lea"]);
    expect(await target.auth.verify("test@example.com", "richtig-geheim")).toMatchObject({ name: "Test" });
    expect(target.media.list().map((item) => item.id)).toEqual([source.image.id]);

    const served = await target.app.request(source.image.url);
    expect(served.status).toBe(200);
    expect((await served.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test("sessions are left out, so restoring signs everybody out", async () => {
    const source = await filledSite();
    const entries = unzipSync(source.backups.create());
    const copy = join(mkdtempSync(join(tmpdir(), "theta-check-")), "copy.db");
    await Bun.write(copy, entries["theta.db"]!);
    const db = new Database(copy);
    expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM sessions").get()!.n).toBe(0);
    db.close();

    source.backups.restore(source.backups.create());
    expect((await source.request("/admin")).status).toBe(302);
  });

  test("a running file database with recent writes is copied completely", async () => {
    const dir = mkdtempSync(join(tmpdir(), "theta-file-"));
    const db = openDatabase(join(dir, "theta.db"));
    const pages = new PageStore(db);
    for (let i = 0; i < 20; i++) pages.create(`Seite ${i}`);
    const backups = new Backups(db, join(dir, "uploads"));
    new MediaStore(db, join(dir, "uploads"));

    const target = await testSite();
    expect(target.backups.restore(backups.create()).pages).toBe(pages.list().length + pages.sharedSections().length);
    expect(target.pages.list().map((page) => page.title)).toContain("Seite 19");
  });

  test("restoring works even when the uploads folder went missing", async () => {
    const source = await filledSite();
    const target = await testSite();
    rmSync(target.uploads, { recursive: true });
    target.backups.restore(source.backups.create());
    expect((await target.app.request(source.image.url)).status).toBe(200);
  });

  test("an older backup is brought up to the current version", async () => {
    // A database as an early Theta version left it: pages, accounts and settings only.
    const dir = mkdtempSync(join(tmpdir(), "theta-old-"));
    const file = join(dir, "theta.db");
    const old = new Database(file);
    migrations.slice(0, 3).forEach((sql) => old.run(sql));
    old.run("PRAGMA user_version = 3");
    old.run("INSERT INTO pages (slug, title, blocks, updated_at) VALUES ('home', 'Alt', '[]', '2026-09-30T00:00:00Z')");
    old.run("INSERT INTO pages (slug, title, blocks, updated_at, position) VALUES ('kontakt', 'Kontakt', '[]', '2026-09-30T00:00:00Z', 1)");
    old.close();
    const archive = zip(new Map([
      ["theta-backup.json", new TextEncoder().encode(JSON.stringify({ format: 1, schema: 3, createdAt: "2026-09-30T00:00:00Z", site: "" }))],
      ["theta.db", await Bun.file(file).bytes()],
    ]));

    const target = await testSite();
    target.backups.restore(archive);
    expect(target.pages.live("kontakt")!.title).toBe("Kontakt");
    expect(target.pages.get("home")!.title).toBe("Alt");
  });

  test("anything that is not a usable Theta backup is refused without changing the site", async () => {
    const site = await filledSite();
    const backup = unzipSync(site.backups.create());
    const manifest = JSON.parse(strFromU8(backup["theta-backup.json"]!));
    const withEntries = (extra: Record<string, Uint8Array>) => zip(new Map(Object.entries({ ...backup, ...extra })));
    const json = (value: object) => new TextEncoder().encode(JSON.stringify(value));

    const cases: [Uint8Array, RegExp][] = [
      [new TextEncoder().encode("kein zip"), /keine lesbare ZIP/],
      [zip(new Map([["index.html", new TextEncoder().encode("<h1>Export</h1>")]])), /keine Theta-Sicherung/],
      [withEntries({ "theta-backup.json": json({ ...manifest, schema: migrations.length + 1 }) }), /neueren Theta-Version/],
      [withEntries({ "theta-backup.json": json({ ...manifest, format: 2 }) }), /Sicherungsformat/],
      [withEntries({ "theta.db": new TextEncoder().encode("SQLite format 3\0 kaputt") }), /beschädigt/],
      [withEntries({ "uploads/../../boese.txt": new Uint8Array([1]) }), /Unerwartete Datei/],
      [withEntries({ "anderswo/datei.txt": new Uint8Array([1]) }), /Unerwartete Datei/],
    ];
    for (const [archive, message] of cases) {
      expect(() => site.backups.restore(archive)).toThrow(message);
    }
    expect(() => site.backups.restore(new Uint8Array())).toThrow(BackupError);
    expect(site.settings.site().name).toBe("Café Morgenrot");
    expect(site.media.list()).toHaveLength(1);
    expect((await site.request("/admin")).status).toBe(200);
  });
});

describe("backups in the admin", () => {
  test("logged-in users download a backup named after the site", async () => {
    const site = await filledSite();
    const response = await site.request("/admin/backup", form({}));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/cafe-morgenrot-sicherung-\d{4}-\d{2}-\d{2}\.zip/);
    expect(unzipSync(new Uint8Array(await response.arrayBuffer()))["theta.db"]).toBeDefined();

    const anonymous = await site.app.request("/admin/backup", form({}));
    expect(anonymous.status).toBe(302);
    expect((await site.request("/admin")).headers.get("content-type")).toContain("text/html");
    expect(await (await site.request("/admin")).text()).toContain("Sicherung herunterladen");
  });

  test("restoring needs a confirmation, keeps a copy of the old site and asks to sign in again", async () => {
    const source = await filledSite();
    const archive = source.backups.create();
    const target = await testSite({ login: true });
    target.pages.create("Wird ersetzt");

    const unconfirmed = await target.request("/admin/restore", restoreForm(archive, {}));
    expect(unconfirmed.status).toBe(400);
    expect(target.pages.list().map((page) => page.title)).toContain("Wird ersetzt");

    const response = await target.request("/admin/restore", restoreForm(archive, { confirm: "ja" }));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?wiederhergestellt");
    expect(target.pages.list().map((page) => page.title)).not.toContain("Wird ersetzt");
    expect(target.settings.site().name).toBe("Café Morgenrot");
    expect(readdirSync(target.safety).some((name) => /^vor-wiederherstellung-.*\.zip$/.test(name))).toBe(true);
    expect((await target.request("/admin")).status).toBe(302);
    expect(await (await target.app.request("/login?wiederhergestellt")).text()).toContain("Die Sicherung wurde eingespielt");
  });

  test("a wrong file shows a friendly error", async () => {
    const site = await testSite({ login: true });
    const response = await site.request("/admin/restore", restoreForm(new TextEncoder().encode("nein"), { confirm: "ja" }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("keine lesbare ZIP-Datei");
  });

  test("a fresh Theta can start from a backup instead of a new account", async () => {
    const source = await filledSite();
    const archive = source.backups.create();
    const fresh = await testSite();
    expect(await (await fresh.app.request(`/setup?token=${SETUP_TOKEN}`)).text()).toContain("Umzug von einem anderen Rechner?");

    const locked = await fresh.app.request("/setup/restore", restoreForm(archive, { token: "falsch" }));
    expect(locked.status).toBe(403);
    expect(fresh.auth.hasUsers()).toBe(false);

    const response = await fresh.app.request("/setup/restore", restoreForm(archive, { token: SETUP_TOKEN }));
    expect(response.headers.get("location")).toBe("/login?wiederhergestellt");
    expect(fresh.settings.site().name).toBe("Café Morgenrot");

    // Once an account exists, the setup route no longer accepts backups.
    const again = await fresh.app.request("/setup/restore", restoreForm(archive, { token: SETUP_TOKEN }));
    expect(again.headers.get("location")).toBe("/login");
  });

  test("no temporary files are left next to the uploads", async () => {
    const source = await filledSite();
    source.backups.restore(source.backups.create());
    const parent = join(source.uploads, "..");
    const leftovers = readdirSync(parent).filter((name) => name.startsWith(source.uploads.split("/").at(-1)!) && name !== source.uploads.split("/").at(-1));
    expect(leftovers).toEqual([]);
    expect(existsSync(source.uploads)).toBe(true);
  });
});

test("accounts from a restored backup keep working with the auth store", async () => {
  const source = await filledSite();
  const target = await testSite();
  target.backups.restore(source.backups.create());
  const auth = new AuthStore(target.db);
  expect(auth.hasUsers()).toBe(true);
});
