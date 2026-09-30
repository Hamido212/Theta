import { expect, test } from "bun:test";
import type { Page } from "../src/blocks";
import { renderEditor, renderPage } from "../src/render";
import { paragraphs } from "../src/theme/fields";

const page: Page = {
  slug: "home",
  title: "Test",
  updatedAt: "2026-09-30T00:00:00.000Z",
  blocks: [
    { id: "h", type: "heading", text: "Hallo <Welt>" },
    { id: "t", type: "text", text: "Erster Absatz\nzweite Zeile\n\nZweiter Absatz" },
    { id: "i", type: "image", src: "/media/theta.svg", alt: "Theta" },
  ],
};

test("public page is escaped HTML without any script", () => {
  const html = renderPage(page);
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("Hallo &lt;Welt&gt;");
  expect(html).toContain('<img src="/media/theta.svg" alt="Theta"');
  expect(html).not.toContain("<script");
});

test("text blocks become paragraphs with line breaks", () => {
  const html = renderPage(page);
  expect(html).toContain("<p><span>Erster Absatz</span><span><br/>zweite Zeile</span></p>");
  expect(html).toContain("<p><span>Zweiter Absatz</span></p>");
  expect(paragraphs("  \n\n a \n \n b ")).toEqual(["a", "b"]);
});

test("editor page embeds the page data safely", () => {
  const html = renderEditor({ ...page, blocks: [{ id: "x", type: "text", text: "</script><script>alert(1)</script>" }] });
  expect(html).toContain('<script type="module" src="/assets/editor.js">');
  expect(html).not.toContain("</script><script>alert(1)");
  const json = html.match(/<script id="theta-page" type="application\/json">(.*?)<\/script>/)?.[1];
  expect(JSON.parse(json!).blocks[0].text).toBe("</script><script>alert(1)</script>");
});
