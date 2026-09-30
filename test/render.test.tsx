import { expect, test } from "bun:test";
import type { Page } from "../src/blocks";
import { type SiteContext, renderEditor, renderPage, renderRobots, renderSitemap } from "../src/render";
import { paragraphs } from "../src/theme/fields";

const page: Page = {
  slug: "ueber-uns",
  kind: "page",
  title: "Über uns",
  description: "Wer wir sind",
  inNav: true,
  updatedAt: "2026-09-30T12:00:00.000Z",
  publishedAt: null,
  blocks: [
    { id: "h", type: "heading", text: "Hallo <Welt>" },
    { id: "t", type: "text", text: "Erster Absatz\nzweite Zeile\n\nZweiter Absatz" },
    { id: "i", type: "image", src: "/media/theta.svg", alt: "Theta" },
  ],
};

const context: SiteContext = {
  site: { name: "Bäckerei Sonne", description: "Brot aus Bremen" },
  nav: [
    { slug: "ueber-uns", title: "Über uns" },
    { slug: "kontakt", title: "Kontakt" },
  ],
  origin: "https://example.com",
};

test("public page is escaped HTML without any script", () => {
  const html = renderPage(page, context);
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("Hallo &lt;Welt&gt;");
  expect(html).toContain('<img src="/media/theta.svg" alt="Theta"');
  expect(html).not.toContain("<script");
});

test("text blocks become paragraphs with line breaks", () => {
  const html = renderPage(page, context);
  expect(html).toContain("<p><span>Erster Absatz</span><span><br/>zweite Zeile</span></p>");
  expect(html).toContain("<p><span>Zweiter Absatz</span></p>");
  expect(paragraphs("  \n\n a \n \n b ")).toEqual(["a", "b"]);
});

test("pages carry title, description, canonical link and preview tags", () => {
  const html = renderPage(page, context);
  expect(html).toContain("<title>Über uns · Bäckerei Sonne</title>");
  expect(html).toContain('<meta name="description" content="Wer wir sind"/>');
  expect(html).toContain('<link rel="canonical" href="https://example.com/ueber-uns"/>');
  expect(html).toContain('<meta property="og:image" content="https://example.com/media/theta.svg"/>');

  const home = renderPage({ ...page, slug: "home", description: "", blocks: [] }, context);
  expect(home).toContain("<title>Bäckerei Sonne</title>");
  expect(home).toContain('<meta name="description" content="Brot aus Bremen"/>');
  expect(home).toContain('<link rel="canonical" href="https://example.com/"/>');
  expect(home).not.toContain("og:image");
});

test("navigation marks the current page", () => {
  const html = renderPage(page, context);
  expect(html).toContain('<a href="/ueber-uns" aria-current="page">Über uns</a>');
  expect(html).toContain('<a href="/kontakt">Kontakt</a>');
  expect(html).toContain('<a class="t-brand" href="/">Bäckerei Sonne</a>');
});

test("editor page embeds the page data safely", () => {
  const evil = { ...page, blocks: [{ id: "x", type: "text" as const, text: "</script><script>alert(1)</script>" }] };
  const html = renderEditor({ page: evil, site: context.site, nav: context.nav, pages: context.nav });
  expect(html).toContain('<script type="module" src="/assets/editor.js">');
  expect(html).not.toContain("</script><script>alert(1)");
  const json = html.match(/<script id="theta-page" type="application\/json">(.*?)<\/script>/)?.[1];
  expect(JSON.parse(json!).page.blocks[0].text).toBe("</script><script>alert(1)</script>");
});

test("sitemap and robots.txt use absolute addresses", () => {
  const sitemap = renderSitemap([{ ...page, slug: "home" }, page], "https://example.com");
  expect(sitemap).toContain("<loc>https://example.com/</loc><lastmod>2026-09-30</lastmod>");
  expect(sitemap).toContain("<loc>https://example.com/ueber-uns</loc>");
  expect(renderRobots("https://example.com")).toContain("Sitemap: https://example.com/sitemap.xml");
});
