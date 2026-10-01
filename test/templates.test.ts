import { expect, test } from "bun:test";
import { type Block, parseBlocks } from "../src/blocks";
import { findTemplates, insertTemplate, pageBlocks, pageTemplates, sectionTemplates } from "../src/templates";

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

test("agency templates cover a complete site, share widths and remain independent", () => {
  const agency = sectionTemplates.filter((template) => template.category === "agency");
  expect(agency).toHaveLength(7);
  for (const template of agency) expect(template.blocks()[0]).toMatchObject({ type: "section", width: "wide" });
  const home = pageBlocks("agency", "HYOS");
  expect(home[0]).toMatchObject({ type: "hero", title: "HYOS", width: "wide" });
  expect(home.filter((block) => block.type === "heading").map((block) => block.text)).toEqual([
    "Was wir für dich bauen.", "Ausgewählte Projekte", "Ein klarer Weg zum Ergebnis.", "Die Menschen hinter den Ideen.", "Häufige Fragen", "Deine Idee ist der Anfang.",
  ]);
  const first = agency.find((template) => template.id === "agency-services")!.blocks();
  const second = agency.find((template) => template.id === "agency-services")!.blocks();
  const columns = first.find((block) => block.type === "columns")!;
  columns.items[0]!.text = "Eigener Text";
  expect(second.find((block) => block.type === "columns")!.items[0]!.text).toBe("");
});

test("section search combines category and visible descriptions", () => {
  expect(findTemplates(sectionTemplates, "HANDY", "agency").map((template) => template.id)).toEqual(["agency-process"]);
  expect(findTemplates(sectionTemplates, " kontakt ", "agency").some((template) => template.id === "agency-contact")).toBe(true);
  expect(findTemplates(sectionTemplates, "nicht vorhanden")).toEqual([]);
  expect(findTemplates(sectionTemplates, "", "custom")).toEqual([]);
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
