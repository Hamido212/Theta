import { expect, test } from "bun:test";
import { type Block, parseBlocks } from "../src/blocks";
import { insertTemplate, pageBlocks, pageTemplates, sectionTemplates } from "../src/templates";

test("every template produces valid blocks with fresh ids", () => {
  for (const template of sectionTemplates) {
    const blocks = template.blocks();
    expect(parseBlocks(blocks)).toEqual(blocks);
    expect(new Set([...blocks, ...template.blocks()].map((b) => b.id)).size).toBe(blocks.length * 2);
  }
  for (const { id } of pageTemplates) {
    const blocks = pageBlocks(id, "Café Morgenrot");
    expect(parseBlocks(blocks)).toEqual(blocks);
  }
});

test("page templates start with the page title", () => {
  expect(pageBlocks("blank", "Über uns")).toMatchObject([{ type: "heading", text: "Über uns", level: 1 }]);
  expect(pageBlocks("home", "Café Morgenrot")[0]).toMatchObject({ type: "hero", title: "Café Morgenrot" });
  expect(pageBlocks("contact", "Kontakt").filter((b) => b.type === "heading" && b.level === 1)).toHaveLength(1);
});

test("a template inserted mid-page does not swallow the blocks after it", () => {
  const text = (id: string): Block => ({ id, type: "text", text: id });
  const band: Block = { id: "s", type: "section", background: "inverse" };
  const offer = sectionTemplates.find((t) => t.id === "offer")!.blocks();

  const list = insertTemplate([band, text("a"), text("b")], 2, offer);
  expect(list.slice(2, 2 + offer.length)).toEqual(offer);
  expect(list[2 + offer.length]).toMatchObject({ type: "section", background: "inverse" });
  expect(list.at(-1)).toEqual(text("b"));

  // At the end of the page, or right before another section, nothing needs closing.
  expect(insertTemplate([text("a")], 1, offer)).toHaveLength(1 + offer.length);
  expect(insertTemplate([text("a"), band], 1, offer)).toHaveLength(2 + offer.length);
  expect(insertTemplate([text("a"), text("b")], 1, offer)[1 + offer.length]).toMatchObject({ background: "plain" });
});
