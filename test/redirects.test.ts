import { describe, expect, test } from "bun:test";
import { exportSite } from "../src/export";
import { form, testSite } from "./helpers";

const json = (body: unknown, origin = "http://localhost") => ({
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify(body),
});

const text = (value: string) => [{ id: "text", type: "text" as const, text: value }];

// A site with a published page "Über uns" at /ueber-uns.
async function siteWithPage() {
  const site = await testSite({ login: true });
  const page = site.pages.create("Über uns");
  site.pages.save(page.slug, { blocks: text("Wir sind ein kleines Café.") });
  return { ...site, page: site.pages.publish(page.slug, true) };
}

describe("a page gets a new address", () => {
  test("the old address leads to the new one, history and footer links come along", async () => {
    const site = await siteWithPage();
    site.settings.saveSite({ name: "Café", imprint: "ueber-uns" });
    const moved = site.pages.changeSlug("ueber-uns", "Wer wir sind!", site.page.version);
    expect(moved).toMatchObject({ slug: "wer-wir-sind", title: "Über uns", version: site.page.version + 1 });
    expect(site.pages.revisions("wer-wir-sind").length).toBeGreaterThan(0);
    expect(site.pages.revisions("ueber-uns")).toEqual([]);
    expect(site.settings.site().imprint).toBe("wer-wir-sind");

    const old = await site.app.request("/ueber-uns");
    expect(old.status).toBe(301);
    expect(old.headers.get("location")).toBe("/wer-wir-sind");
    expect(old.headers.get("cache-control")).toBe("public, max-age=3600");
    expect((await site.app.request("/ueber-uns/")).headers.get("location")).toBe("/wer-wir-sind");
    expect(await (await site.app.request("/wer-wir-sind")).text()).toContain("Wir sind ein kleines Café.");
    const sitemap = await (await site.app.request("/sitemap.xml")).text();
    expect(sitemap).toContain("/wer-wir-sind");
    expect(sitemap).not.toContain("/ueber-uns");
    expect(site.pages.redirects.list()).toMatchObject([{ from: "/ueber-uns", to: "/wer-wir-sind", reason: "rename" }]);
  });

  test("moving again skips the extra step, and moving back removes the loop", async () => {
    const site = await siteWithPage();
    site.pages.changeSlug("ueber-uns", "team");
    site.pages.changeSlug("team", "menschen");
    expect(site.pages.redirects.find("/ueber-uns")).toBe("/menschen");
    expect(site.pages.redirects.find("/team")).toBe("/menschen");
    site.pages.changeSlug("menschen", "ueber-uns");
    expect(site.pages.redirects.find("/ueber-uns")).toBeNull();
    expect(site.pages.redirects.find("/team")).toBe("/ueber-uns");
    expect((await site.app.request("/ueber-uns")).status).toBe(200);
  });

  test("blog posts move within the blog; drafts need no redirect", async () => {
    const site = await testSite();
    const post = site.pages.create("Neue Karte", "", "post");
    site.pages.publish(post.slug, true);
    site.pages.changeSlug(post.slug, "herbstkarte");
    expect((await site.app.request("/blog/neue-karte")).headers.get("location")).toBe("/blog/herbstkarte");
    expect((await site.app.request("/blog/herbstkarte")).status).toBe(200);

    const draft = site.pages.create("Entwurf");
    site.pages.changeSlug(draft.slug, "spaeter");
    expect((await site.app.request("/entwurf")).status).toBe(404);
    expect(site.pages.redirects.find("/entwurf")).toBeNull();
  });

  test("taken, reserved and empty addresses are refused", async () => {
    const site = await siteWithPage();
    const other = site.pages.create("Kontakt");
    const trashed = site.pages.create("Alt");
    site.pages.delete(trashed.slug);
    const shared = site.pages.createShared("Fußzeile", [{ id: "s", type: "section", background: "soft" }, ...text("x")]);
    expect(() => site.pages.changeSlug("ueber-uns", "Kontakt")).toThrow("Die Adresse /kontakt ist schon vergeben");
    expect(() => site.pages.changeSlug("ueber-uns", "alt")).toThrow("schon vergeben");
    expect(() => site.pages.changeSlug("ueber-uns", "admin")).toThrow("schon vergeben");
    expect(() => site.pages.changeSlug("ueber-uns", "blog")).toThrow("schon vergeben");
    expect(() => site.pages.changeSlug("ueber-uns", " !! ")).toThrow("mindestens einen Buchstaben");
    expect(() => site.pages.changeSlug("home", "start")).toThrow("Startseite");
    expect(() => site.pages.changeSlug(shared.slug, "abschnitt")).toThrow("keine eigene Adresse");
    expect(site.pages.changeSlug(other.slug, "kontakt")).toMatchObject({ slug: "kontakt" });
    expect(site.pages.redirects.list()).toEqual([]);
  });

  test("the editor's API checks login, origin and version", async () => {
    const site = await siteWithPage();
    const path = "/api/pages/ueber-uns/address";
    expect((await site.app.request(path, json({ slug: "team" }))).status).toBe(401);
    expect((await site.request(path, json({ slug: "team" }, "https://evil.test"))).status).toBe(403);
    const stale = await site.request(path, json({ slug: "team", version: site.page.version - 1 }));
    expect(stale.status).toBe(409);
    const taken = await site.request(path, json({ slug: "admin", version: site.page.version }));
    expect(taken.status).toBe(400);
    expect(((await taken.json()) as { error: string }).error).toContain("schon vergeben");
    const moved = await site.request(path, json({ slug: "Unser Team", version: site.page.version }));
    expect(moved.status).toBe(200);
    expect(((await moved.json()) as { slug: string }).slug).toBe("unser-team");
  });
});

describe("redirects added by hand", () => {
  test("lead old addresses of a previous website to the new pages", async () => {
    const site = await siteWithPage();
    const added = await site.request("/admin/redirects", form({ from: "https://alte-seite.de/ueber-uns.html?lang=de#team", to: "/ueber-uns" }));
    expect(added.status).toBe(303);
    await site.request("/admin/redirects", form({ from: "/2019/05/Sommerfest/", to: "https://example.com/fotos" }));
    await site.request("/admin/redirects", form({ from: "/blog/alter-beitrag", to: "/ueber-uns" }));

    expect((await site.app.request("/ueber-uns.html")).headers.get("location")).toBe("/ueber-uns");
    expect((await site.app.request("/2019/05/Sommerfest")).headers.get("location")).toBe("https://example.com/fotos");
    expect((await site.app.request("/blog/alter-beitrag")).headers.get("location")).toBe("/ueber-uns");
    // Only visits are redirected, not forms sent to the address.
    expect((await site.app.request("/ueber-uns.html", form({ name: "x" }))).status).toBe(404);

    const dashboard = await (await site.request("/admin")).text();
    expect(dashboard).toContain("3 Weiterleitungen");
    expect(dashboard).toContain("<code>/ueber-uns.html</code>");

    await site.request("/admin/redirects/delete", form({ from: "/ueber-uns.html" }));
    expect((await site.app.request("/ueber-uns.html")).status).toBe(404);
    expect(site.pages.redirects.list()).toHaveLength(2);
  });

  test("refuse addresses that would break the site", async () => {
    const site = await siteWithPage();
    const error = async (from: string, to: string) => {
      const response = await site.request("/admin/redirects", form({ from, to }));
      expect(response.status).toBe(400);
      return response.text();
    };
    expect(await error("/ueber-uns", "/kontakt")).toContain("Unter /ueber-uns gibt es schon eine Seite");
    expect(await error("/admin/login", "/")).toContain("wird von Theta selbst gebraucht");
    expect(await error("/", "/kontakt")).toContain("Startseite");
    expect(await error("ueber-uns.html", "/kontakt")).toContain("muss mit / beginnen");
    expect(await error("/alt", "javascript:alert(1)")).toContain("Das Ziel muss mit / beginnen");
    expect(await error("/alt", "//evil.test")).toContain("Das Ziel muss mit / beginnen");
    expect(await error("/alt/", "/alt")).toContain("nicht auf sich selbst");
    await site.request("/admin/redirects", form({ from: "/a", to: "/b" }));
    await site.request("/admin/redirects", form({ from: "/b", to: "/c" }));
    expect(await error("/c", "/a")).toContain("Schleife");
    expect((await site.app.request("/admin/redirects", form({ from: "/x", to: "/y" }))).status).toBe(302);
  });
});

test("the static export keeps redirects for any web host", async () => {
  const site = await siteWithPage();
  site.pages.changeSlug("ueber-uns", "team");
  site.pages.redirects.add({ from: "/alt/seite.html", to: "/team" }, () => false);
  site.pages.redirects.add({ from: "/team-alt", to: "https://example.com/?a=1&b=<2>" }, () => false);
  // A page now lives where a redirect used to start: the page wins.
  site.pages.redirects.add({ from: "/kontakt", to: "/team" }, () => false);
  const kontakt = site.pages.create("Kontakt");
  site.pages.publish(kontakt.slug, true);

  const files = await exportSite(site, "https://cafe.test");
  const read = (path: string) => new TextDecoder().decode(files.get(path));
  expect(read("_redirects").split("\n")).toEqual(expect.arrayContaining(["/ueber-uns /team 301", "/alt/seite.html /team 301"]));
  expect(read("ueber-uns/index.html")).toContain('<meta http-equiv="refresh" content="0; url=https://cafe.test/team">');
  expect(read("alt/seite.html")).toContain('<link rel="canonical" href="https://cafe.test/team">');
  expect(read("team-alt/index.html")).toContain("https://example.com/?a=1&amp;b=%3C2%3E");
  expect(read("kontakt/index.html")).not.toContain("http-equiv");
});
