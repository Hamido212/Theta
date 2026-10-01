import { type Block, type NavItem, type Page, type SectionBlock, ValidationError } from "./blocks";

export type SharedSectionData = { page: Page; liveBlocks: Block[] | null; usage: NavItem[] };
export type SharedSections = Record<string, Block[]>;

export function validateSection(blocks: Block[]) {
  if (blocks.length < 2 || blocks[0]?.type !== "section" || blocks.slice(1).some((block) => block.type === "section" || block.type === "shared" || block.type === "hero" || (block.type === "heading" && block.level === 1))) {
    throw new ValidationError("Bitte genau einen Abschnitt mit Inhalt auswählen. Gemeinsame Abschnitte können keine weiteren Abschnitte oder Seitentitel enthalten.");
  }
}

// Expand references identically for live rendering and export. Prefix ids so the
// same shared section may occur twice. Content after it resumes its previous band.
export function expandSharedSections(blocks: Block[], shared: SharedSections = {}): Block[] {
  const result: Block[] = [];
  let running: SectionBlock | undefined;
  blocks.forEach((block, index) => {
    if (block.type === "section") running = block;
    if (block.type !== "shared") { result.push(block); return; }
    const content = Object.hasOwn(shared, block.sectionId) ? shared[block.sectionId] : undefined;
    if (!content) return;
    result.push(...content.map((item) => ({ ...item, id: `${block.id}-${item.id}` })));
    const next = blocks[index + 1];
    if (next && next.type !== "section" && next.type !== "shared") result.push({
      ...(running ?? { type: "section", background: "plain" }), id: `${block.id}-continuation`,
    });
  });
  return result;
}
