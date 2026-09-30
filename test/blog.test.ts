import { describe, expect, test } from "bun:test";
import { excerpt, formatDate } from "../src/blocks";
import { exportSite } from "../src/export";
import { form, testSite } from "./helpers";

const json = (body: unknown) => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("posts", () => {
  test("a new post is a draft that nobody can see", async () => {
    const { pages, request } = await testSite();
    const post = pages.create("Unser neues Brot", "Hamid", "post");
    expect(post).toMatchObject({ slug: "unser-neues-brot", kind: "post", publishedAt: null, inNav: false });

    expect((await request("/blog/unser-neues-brot")).status).toBe(404);
    expect(await (await request("/blog")).text()).not.toContain("Unser neues Brot");
    expect(pages.nav().map((item) => item.slug)).not.toContain("blog");
    expect(pages.list().map((page) => page.slug)).not.toContain("unser-neues-brot");
  });

  test("publishing puts the post in the blog, the menu and the feed", async () => {
    const { pages, request } = await testSite();
    const { slug } = pages.create("Unser neues Brot", "", "post");
    pages.save(slug, { description: "Ab Montag gibt es Dinkel.", blocks: [{ id: "h", type: "heading", text: "Unser neues Brot", level: 1 }] });
    const published = pages.publish(slug, true);
    expect(published.publishedAt).not.toBeNull();

    const page = await request(`/blog/${slug}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`<time dateTime="${published.publishedAt}">${formatDate(published.publishedAt!)}</time>`);
    expect(html).toContain('<meta property="og:type" content="article"/>');
    expect(html).toContain('<link rel="canonical" href="http://localhost/blog/unser-neues-brot"/>');
    expect(html).toContain('href="/blog" aria-current="page">Blog</a>');
    expect(html).toContain('type="application/rss+xml"');
    expect(html).not.toContain("<script");

    const index = await (await request("/blog")).text();
    expect(index).toContain('<a href="/blog/unser-neues-brot">Unser neues Brot</a>');
    expect(index).toContain("Ab Montag gibt es Dinkel.");

    // Posts are not pages: the short address does not exist.
    expect((await request(`/${slug}`)).status).toBe(404);

    const feed = await request("/blog/feed.xml");
    expect(feed.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await feed.text();
    expect(xml).toContain("<title>Unser neues Brot</title>");
    expect(xml).toContain("<link>http://localhost/blog/unser-neues-brot</link>");
    expect(xml).toContain(`<pubDate>${new Date(published.publishedAt!).toUTCString()}</pubDate>`);

    const sitemap = await (await request("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>http://localhost/blog</loc>");
    expect(sitemap).toContain("<loc>http://localhost/blog/unser-neues-brot</loc>");

    expect(pages.nav().at(-1)).toEqual({ slug: "blog", title: "Blog", href: "/blog" });
  });

  test("the blog lists newest first and keeps the first publication date", async () => {
    const { pages, db } = await testSite();
    const older = pages.create("Älter", "", "post");
    const newer = pages.create("Neuer", "", "post");
    const draft = pages.create("Entwurf", "", "post");
    pages.publish(older.slug, true);
    db.query("UPDATE pages SET published_at = '2026-01-01T09:00:00.000Z' WHERE slug = ?").run(older.slug);
    pages.publish(newer.slug, true);

    expect(pages.posts().map((post) => post.slug)).toEqual(["neuer", "aelter"]);
    expect(pages.posts({ drafts: true }).map((post) => post.slug)).toEqual([draft.slug, "neuer", "aelter"]);

    // Saving or publishing again does not move an already published post to the top.
    pages.save(older.slug, { title: "Älter, überarbeitet", published: true });
    expect(pages.get(older.slug)!.publishedAt).toBe("2026-01-01T09:00:00.000Z");

    // Taking it back to a draft clears the date.
    pages.save(older.slug, { published: false });
    expect(pages.get(older.slug)!.publishedAt).toBeNull();
  });

  test("pages cannot be published and cannot take the blog's address", async () => {
    const { pages } = await testSite();
    expect(() => pages.publish("home", true)).toThrow("Beitrag nicht gefunden");
    pages.save("home", { published: true });
    expect(pages.get("home")!.publishedAt).toBeNull();
    expect(pages.create("Blog").slug).toBe("blog-2");
  });

  test("the excerpt is the description, or else the start of the first text", () => {
    const base = { slug: "a", kind: "post" as const, title: "A", inNav: false, updatedAt: "", publishedAt: null };
    expect(excerpt({ ...base, description: "Kurz", blocks: [] })).toBe("Kurz");
    const long = "Wort ".repeat(100);
    const text = excerpt({ ...base, description: "", blocks: [{ id: "t", type: "text", text: long }] });
    expect(text.length).toBeLessThanOrEqual(222);
    expect(text.endsWith("Wort …")).toBe(true);
  });
});

describe("blog admin", () => {
  test("creates a post, publishes it and deletes it", async () => {
    const { pages, request } = await testSite({ login: true });
    const created = await request("/admin/blog", form({ title: "Hallo Welt" }));
    expect(created.status).toBe(302);
    expect(created.headers.get("location")).toBe("/edit/hallo-welt");
    expect(await (await request("/admin/blog")).text()).toContain("Entwurf");

    expect((await request("/admin/blog/hallo-welt/publish", form({ published: "1" }))).status).toBe(302);
    expect(pages.get("hallo-welt")!.publishedAt).not.toBeNull();
    expect(await (await request("/admin/blog")).text()).toContain("Zurück zu Entwurf");

    expect((await request("/admin/blog/hallo-welt/publish", form({ published: "0" }))).status).toBe(302);
    expect(pages.get("hallo-welt")!.publishedAt).toBeNull();

    expect((await request("/admin/blog/home/delete", form({}))).status).toBe(400);
    expect(pages.get("home")).not.toBeNull();
    expect((await request("/admin/blog/hallo-welt/delete", form({}))).status).toBe(302);
    expect(pages.get("hallo-welt")).toBeNull();
  });

  test("the editor saves the published switch of a post", async () => {
    const { pages, request } = await testSite({ login: true });
    const { slug } = pages.create("Neuigkeiten", "", "post");
    const editor = await (await request(`/edit/${slug}`)).text();
    expect(editor).toContain('"kind":"post"');

    const res = await request(`/api/pages/${slug}`, json({ published: true, blocks: [] }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { publishedAt: string | null }).publishedAt).not.toBeNull();
    expect(pages.revisions(slug)[0]!.author).toBe("Test");
  });

  test("the blog admin needs a login", async () => {
    const { request } = await testSite();
    expect((await request("/admin/blog")).status).toBe(302);
    expect((await request("/admin/blog", form({ title: "X" }))).status).toBe(302);
  });
});

test("the static export contains the blog, its posts and the feed, but no drafts", async () => {
  const { pages, settings, media } = await testSite();
  const post = pages.create("Sommerfest", "", "post");
  pages.publish(post.slug, true);
  pages.create("Geheim", "", "post");

  const files = await exportSite({ pages, settings, media }, "https://example.com");
  expect(files.has("blog/index.html")).toBe(true);
  expect(files.has("blog/sommerfest/index.html")).toBe(true);
  expect(files.has("blog/feed.xml")).toBe(true);
  expect(files.has("blog/geheim/index.html")).toBe(false);
  expect(files.has("sommerfest/index.html")).toBe(false);
  const feed = new TextDecoder().decode(files.get("blog/feed.xml"));
  expect(feed).toContain("<link>https://example.com/blog/sommerfest</link>");
  expect(feed).not.toContain("Geheim");
});
