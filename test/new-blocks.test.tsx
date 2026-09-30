import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type Block, ValidationError, newBlock, parseBlocks } from "../src/blocks";
import { BlockView } from "../src/theme/blocks";
import { videoSource } from "../src/theme/video";

const render = (block: Block) => renderToStaticMarkup(<BlockView block={block} />);

describe("parsing", () => {
  test("every new block type starts out valid", () => {
    for (const type of ["gallery", "button", "columns", "video", "quote", "divider"] as const) {
      const block = newBlock(type, "x");
      expect(parseBlocks([block])).toEqual([block]);
    }
  });

  test.each([
    ["button with javascript link", { type: "button", label: "Los", href: "javascript:alert(1)", variant: "primary" }],
    ["too many columns", { type: "columns", items: Array.from({ length: 5 }, () => ({ title: "", text: "" })) }],
    ["gallery image that is not an object", { type: "gallery", images: ["/a.png"] }],
    ["gallery image with unsafe address", { type: "gallery", images: [{ src: "data:text/html,x", alt: "" }] }],
    ["video with unsafe address", { type: "video", url: "javascript:alert(1)", title: "" }],
  ])("rejects %s", (_, block) => {
    expect(() => parseBlocks([{ id: "x", ...block }])).toThrow(ValidationError);
  });

  test("buttons accept pages, websites, e-mail and phone links; unknown variants fall back", () => {
    for (const href of ["/kontakt", "https://example.com", "mailto:hallo@example.com", "tel:+49421123", "#oben"]) {
      expect(parseBlocks([{ id: "x", type: "button", label: "Los", href, variant: "fancy" }])[0]).toMatchObject({ href, variant: "primary" });
    }
  });
});

describe("video addresses", () => {
  test.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "youtube"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "youtube"],
    ["https://vimeo.com/76979871", "vimeo"],
    ["https://example.com/film.mp4", "file"],
    ["/media/film.webm", "file"],
  ])("%s is %s", (url, kind) => {
    expect(videoSource(url)?.kind).toBe(kind as never);
  });

  test.each(["", "https://example.com/seite", "https://youtube.com/watch?v=kurz", "kein link"])("%p is not supported", (url) => {
    expect(videoSource(url)).toBeNull();
  });

  test("YouTube uses the no-cookie domain", () => {
    expect(videoSource("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ embed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1" });
  });
});

describe("rendering", () => {
  test("videos load nothing from the platform until clicked", () => {
    const html = render({ id: "v", type: "video", url: "https://youtu.be/dQw4w9WgXcQ", title: "Unser <Film>" });
    expect(html).toContain("<iframe");
    expect(html).not.toMatch(/<iframe[^>]* src=/);
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).toContain("Unser &amp;lt;Film&amp;gt;");
    expect(render({ id: "v", type: "video", url: "/media/film.mp4", title: "" })).toContain('<video src="/media/film.mp4" controls=""');
  });

  test("buttons only appear with label and target", () => {
    expect(render({ id: "b", type: "button", label: "Kontakt", href: "/kontakt", variant: "secondary" })).toBe(
      '<div class="t-buttons"><a class="t-button t-button-secondary" href="/kontakt">Kontakt</a></div>',
    );
    expect(render({ id: "b", type: "button", label: "Kontakt", href: "", variant: "primary" })).toBe("");
  });

  test("columns, gallery, quote and divider", () => {
    const columns = render({ id: "c", type: "columns", items: [{ title: "Brot", text: "Frisch" }, { title: "", text: "Kuchen" }] });
    expect(columns).toContain('style="--t-columns:2"');
    expect(columns).toContain('<h2 class="t-column-title">Brot</h2>');
    expect(columns.match(/<h2/g)).toHaveLength(1);

    const gallery = render({ id: "g", type: "gallery", images: [{ src: "/a.png", alt: "A" }, { src: "", alt: "" }] });
    expect(gallery.match(/<img/g)).toHaveLength(1);
    expect(render({ id: "g", type: "gallery", images: [] })).toBe("");

    expect(render({ id: "q", type: "quote", text: "Gutes Brot braucht Zeit.", cite: "Oma" })).toContain("<figcaption>Oma</figcaption>");
    expect(render({ id: "q", type: "quote", text: " ", cite: "" })).toBe("");
    expect(render({ id: "d", type: "divider" })).toBe('<hr class="t-divider"/>');
  });
});
