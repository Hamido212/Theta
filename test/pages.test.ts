import { describe, expect, test } from "bun:test";
import { slugify } from "../src/store";
import { form, testSite } from "./helpers";

test.each([
  ["Über uns & Kontakt", "ueber-uns-kontakt"],
  ["  Straße  ", "strasse"],
  ["Café Crème", "cafe-creme"],
  ["???", "seite"],
])("slugify(%p) is %p", (title, slug) => {
  expect(slugify(title)).toBe(slug);
});

describe("pages", () => {
  test("creating a page opens a private draft; publication adds it to the menu", async () => {
    const { request, pages } = await testSite({ login: true });
    const res = await request("/admin/pages", form({ title: "Über uns" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/edit/ueber-uns");

    expect((await request("/edit/ueber-uns")).status).toBe(200);
    expect((await request("/ueber-uns")).status).toBe(404);
    expect(await (await request("/")).text()).not.toContain('<a href="/ueber-uns">');
    pages.publish("ueber-uns", true);
    const page = await request("/ueber-uns");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>Über uns · Meine Website</title>");
    expect(await (await request("/")).text()).toContain('<a href="/ueber-uns">Über uns</a>');
  });

  test("a new page can start from a template; unknown templates fall back to an empty page", async () => {
    const { request, pages } = await testSite({ login: true });
    await request("/admin/pages", form({ title: "Start", template: "home" }));
    expect(pages.get("start")!.blocks.map((b) => b.type)).toContain("hero");
    await request("/admin/pages", form({ title: "Leer", template: "__proto__" }));
    expect(pages.get("leer")!.blocks).toMatchObject([{ type: "heading", text: "Leer" }]);
  });

  test("addresses stay unique and never collide with the app", async () => {
    const { pages } = await testSite();
    expect(pages.create("Kontakt").slug).toBe("kontakt");
    expect(pages.create("Kontakt").slug).toBe("kontakt-2");
    expect(pages.create("Admin").slug).toBe("admin-2");
    expect(pages.create("Home").slug).toBe("home-2");
  });

  test("pages can be hidden from the menu, reordered and deleted", async () => {
    const { request, pages } = await testSite({ login: true });
    pages.create("Eins");
    pages.create("Zwei");
    pages.create("Drei");
    for (const slug of ["eins", "zwei", "drei"]) pages.publish(slug, true);
    expect(pages.nav().map((item) => item.slug)).toEqual(["eins", "zwei", "drei"]);

    await request("/admin/pages/drei/move", form({ direction: "up" }));
    expect(pages.nav().map((item) => item.slug)).toEqual(["eins", "drei", "zwei"]);

    const put = await request("/api/pages/eins", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: pages.get("eins")!.version, action: "publish", title: "Eins", description: "Die erste", inNav: false, blocks: [] }),
    });
    expect(put.status).toBe(200);
    expect(pages.get("eins")).toMatchObject({ description: "Die erste", inNav: false });
    expect(pages.nav().map((item) => item.slug)).toEqual(["drei", "zwei"]);

    const del = await request("/admin/pages/zwei/delete", form({ version: String(pages.get("zwei")!.version) }));
    expect(del.headers.get("location")).toBe("/admin");
    expect((await request("/zwei")).status).toBe(404);
  });

  test("the start page cannot be deleted", async () => {
    const { request, pages } = await testSite({ login: true });
    const res = await request("/admin/pages/home/delete", form({}));
    expect(res.status).toBe(400);
    expect(pages.get("home")).not.toBeNull();
  });

  test("unknown addresses show a themed 404 page, /home points to /", async () => {
    const { request } = await testSite();
    const missing = await request("/gibt-es-nicht");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Seite nicht gefunden");
    const home = await request("/home");
    expect(home.status).toBe(301);
    expect(home.headers.get("location")).toBe("/");
  });
});

describe("admin", () => {
  test("the overview needs a login", async () => {
    const { request, auth } = await testSite();
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    const res = await request("/admin");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fadmin");
    expect((await request("/admin/pages", form({ title: "X" }))).status).toBe(302);
  });

  test("the overview lists pages and saves site settings", async () => {
    const { request, settings } = await testSite({ login: true });
    expect(await (await request("/admin")).text()).toContain("Willkommen bei Theta");

    const res = await request("/admin/site", form({ name: "Bäckerei Sonne", description: "Brot aus Bremen" }));
    expect(res.status).toBe(302);
    expect(settings.site()).toMatchObject({ name: "Bäckerei Sonne", description: "Brot aus Bremen", logo: "", footer: "" });
    expect(await (await request("/")).text()).toContain("<title>Bäckerei Sonne</title>");

    const invalid = await request("/admin/site", form({ name: " ", description: "" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toContain("Name darf nicht leer sein");
  });

  test("footer text, legal pages and logo appear on every page", async () => {
    const { request, pages, settings } = await testSite({ login: true });
    const imprint = pages.create("Impressum");
    pages.publish(imprint.slug, true);
    const fields = { name: "Bäckerei Sonne", description: "", logo: "/media/theta.svg", imprint: imprint.slug, privacy: "" };
    const saved = await request("/admin/site", form({ ...fields, footer: "Hauptstraße 1\r\n28195 Bremen\r\n\r\n[Instagram](https://instagram.com/sonne)" }));
    expect(saved.status).toBe(302);
    expect(settings.site().footer).toBe("Hauptstraße 1\n28195 Bremen\n\n[Instagram](https://instagram.com/sonne)");

    const html = await (await request("/")).text();
    expect(html).toContain('<img src="/media/theta.svg" alt="Bäckerei Sonne"/>');
    expect(html).toContain('<link rel="icon" href="/media/theta.svg"/>');
    expect(html).toContain('<a href="https://instagram.com/sonne" rel="noopener">Instagram</a>');
    // Only in the footer, not twice via the main menu.
    expect(html.split(`<a href="/${imprint.slug}">Impressum</a>`)).toHaveLength(2);
    expect(html).not.toContain("Datenschutz</a>");

    // A deleted legal page simply disappears from the footer.
    pages.delete(imprint.slug);
    expect(await (await request("/")).text()).not.toContain("Impressum</a>");

    const unknown = await request("/admin/site", form({ ...fields, imprint: "gibt-es-nicht" }));
    expect(unknown.status).toBe(400);
    const unsafe = await request("/admin/site", form({ ...fields, imprint: "", logo: "javascript:alert(1)" }));
    expect(unsafe.status).toBe(400);
  });
});

test("sitemap.xml and robots.txt are served", async () => {
  const { request, pages } = await testSite();
  pages.create("Kontakt");
  pages.publish("kontakt", true);
  const sitemap = await (await request("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>http://localhost/</loc>");
  expect(sitemap).toContain("<loc>http://localhost/kontakt</loc>");
  expect(await (await request("/robots.txt")).text()).toContain("Sitemap: http://localhost/sitemap.xml");
});
