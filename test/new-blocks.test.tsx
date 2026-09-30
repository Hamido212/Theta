import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type Block, ValidationError, newBlock, parseBlocks } from "../src/blocks";
import { BlockFlow, BlockView } from "../src/theme/blocks";
import { videoSource } from "../src/theme/video";

const render = (block: Block) => renderToStaticMarkup(<BlockView block={block} />);

describe("parsing", () => {
  test("every new block type starts out valid", () => {
    for (const type of ["gallery", "button", "columns", "video", "quote", "divider", "section", "hero"] as const) {
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
    ["hero button with javascript link", { type: "hero", title: "", text: "", src: "", alt: "", buttons: [{ label: "Los", href: "javascript:alert(1)" }] }],
    ["hero with three buttons", { type: "hero", title: "", text: "", src: "", alt: "", buttons: Array.from({ length: 3 }, () => ({ label: "", href: "" })) }],
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
    const column = { src: "", alt: "", href: "", linkLabel: "" };
    const columns = render({
      id: "c",
      type: "columns",
      style: "plain",
      items: [
        { ...column, title: "Brot", text: "Frisch" },
        { ...column, title: "", text: "Kuchen" },
      ],
    });
    expect(columns).toContain('style="--t-columns:2"');
    expect(columns).toContain('<h3 class="t-column-title">Brot</h3>');
    expect(columns.match(/<h3/g)).toHaveLength(1);

    const gallery = render({ id: "g", type: "gallery", images: [{ src: "/a.png", alt: "A" }, { src: "", alt: "" }], columns: 3, crop: true });
    expect(gallery.match(/<img/g)).toHaveLength(1);
    expect(render({ id: "g", type: "gallery", images: [], columns: 3, crop: true })).toBe("");

    expect(render({ id: "q", type: "quote", text: "Gutes Brot braucht Zeit.", cite: "Oma" })).toContain("<figcaption>Oma</figcaption>");
    expect(render({ id: "q", type: "quote", text: " ", cite: "" })).toBe("");
    expect(render({ id: "d", type: "divider" })).toBe('<hr class="t-divider"/>');
  });
});

describe("layout", () => {
  test("headings render at their level", () => {
    expect(render({ id: "h", type: "heading", text: "Getränke", level: 2 })).toBe('<h2 class="t-heading t-heading-2">Getränke</h2>');
    expect(render({ id: "h", type: "heading", text: "Kaffee", level: 3 })).toBe('<h3 class="t-heading t-heading-3">Kaffee</h3>');
  });

  test("images show their caption and width", () => {
    const html = render({ id: "i", type: "image", src: "/a.png", alt: "Laden", caption: "Unser Laden", width: "full" });
    expect(html).toContain('<figure class="t-image t-width-full">');
    expect(html).toContain("<figcaption>Unser Laden</figcaption>");
    expect(render({ id: "i", type: "image", src: "/a.png", alt: "", caption: " ", width: "normal" })).not.toContain("figcaption");
  });

  test("buttons that follow each other share a row", () => {
    const button = (id: string): Block => ({ id, type: "button", label: id, href: "/", variant: "primary" });
    const blocks: Block[] = [button("a"), button("b"), { id: "t", type: "text", text: "Hallo" }, button("c")];
    const html = renderToStaticMarkup(<BlockFlow blocks={blocks}>{(block) => <BlockView key={block.id} block={block} />}</BlockFlow>);
    expect(html.match(/t-button-row/g)).toHaveLength(1);
    expect(html.indexOf("t-button-row")).toBeLessThan(html.indexOf(">a<"));
    expect(html.indexOf(">c<")).toBeGreaterThan(html.indexOf("</div></div>"));
  });
});

describe("sections and hero", () => {
  const flow = (blocks: Block[]) =>
    renderToStaticMarkup(<BlockFlow blocks={blocks}>{(block) => <BlockView key={block.id} block={block} />}</BlockFlow>);

  test("a section wraps everything up to the next one in a band", () => {
    const html = flow([
      { id: "a", type: "text", text: "Oben" },
      { id: "s1", type: "section", background: "soft" },
      { id: "b", type: "text", text: "Getönt" },
      { id: "s2", type: "section", background: "inverse" },
      { id: "c", type: "text", text: "Dunkel" },
    ]);
    expect(html).toBe(
      '<div class="t-text"><p><span>Oben</span></p></div>' +
        '<div class="t-band t-band-soft"><div class="t-text"><p><span>Getönt</span></p></div></div>' +
        '<div class="t-band t-band-inverse"><div class="t-text"><p><span>Dunkel</span></p></div></div>',
    );
  });

  test("unknown backgrounds fall back to plain", () => {
    expect(parseBlocks([{ id: "s", type: "section", background: "neon" }])[0]).toMatchObject({ background: "plain" });
  });

  test("the hero is the page title and hides unfinished buttons", () => {
    const html = render({
      id: "h",
      type: "hero",
      title: "Café Morgenrot",
      text: "Kaffee und Kuchen",
      src: "/a.jpg",
      alt: "Gastraum",
      buttons: [{ label: "Speisekarte", href: "/speisekarte" }, { label: "Ohne Ziel", href: "" }],
    });
    expect(html).toContain('<h1 class="t-hero-title">Café Morgenrot</h1>');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('<a class="t-button t-button-primary" href="/speisekarte">Speisekarte</a>');
    expect(html).not.toContain("Ohne Ziel");
    expect(render({ id: "h", type: "hero", title: "Hallo", text: "", src: "", alt: "", buttons: [] })).toContain('class="t-hero t-band-accent"');
  });

  test("headings after a hero are section headings", () => {
    const [, heading] = parseBlocks([
      { id: "h", type: "hero", title: "", text: "", src: "", alt: "", buttons: [] },
      { id: "a", type: "heading", text: "Angebot" },
    ]);
    expect(heading).toMatchObject({ level: 2 });
  });
});

describe("cards and gallery layout", () => {
  test("columns saved before cards existed stay plain text columns", () => {
    const [block] = parseBlocks([{ id: "c", type: "columns", items: [{ title: "Brot", text: "Frisch" }] }]);
    expect(block).toEqual({
      id: "c",
      type: "columns",
      style: "plain",
      items: [{ title: "Brot", text: "Frisch", src: "", alt: "", href: "", linkLabel: "" }],
    });
  });

  test("cards show picture and link, but only a link with text and target", () => {
    const card = { title: "Frühstück", text: "Bis 14 Uhr", src: "/a.jpg", alt: "Teller", href: "/speisekarte", linkLabel: "Zur Karte" };
    const html = render({ id: "c", type: "columns", style: "cards", items: [card, { ...card, linkLabel: " " }] });
    expect(html).toContain('class="t-columns t-columns-cards"');
    expect(html.match(/<img/g)).toHaveLength(2);
    expect(html.match(/t-column-link/g)).toHaveLength(1);
    expect(html).toContain('<a class="t-column-link" href="/speisekarte">Zur Karte</a>');
    expect(() => parseBlocks([{ id: "c", type: "columns", style: "cards", items: [{ ...card, href: "javascript:alert(1)" }] }])).toThrow(ValidationError);
  });

  test("galleries choose columns and cropping", () => {
    const [block] = parseBlocks([{ id: "g", type: "gallery", images: [{ src: "/a.jpg", alt: "" }], columns: 7, crop: false }]);
    expect(block).toMatchObject({ columns: 3, crop: false });
    const html = render({ id: "g", type: "gallery", images: [{ src: "/a.jpg", alt: "" }], columns: 2, crop: true });
    expect(html).toContain('class="t-gallery t-gallery-crop" style="--t-gallery-columns:2"');
  });
});
