import { type Block, type NavItem, PROP_FIELDS, type Page, type SectionBlock, type SharedBlock, ValidationError } from "./blocks";

export type SharedSectionData = { page: Page; liveBlocks: Block[] | null; usage: NavItem[] };
export type SharedSections = Record<string, Block[]>;

// A rule shows a shared section on every page of a kind without embedding it by hand,
// e.g. an author box at the end of every blog post.
export type LayoutPlace = "posts-start" | "posts-end" | "pages-end" | "all-end";
export type LayoutRule = { sectionId: string; place: LayoutPlace };
export const layoutPlaces: Record<LayoutPlace, string> = {
  "posts-end": "Am Ende jedes Blogbeitrags",
  "posts-start": "Am Anfang jedes Blogbeitrags, unter dem Titel",
  "pages-end": "Am Ende jeder Seite",
  "all-end": "Am Ende aller Seiten und Beiträge",
};

export function validateSection(blocks: Block[]) {
  if (blocks.length < 2 || blocks[0]?.type !== "section" || blocks.slice(1).some((block) => block.type === "section" || block.type === "shared" || block.type === "hero" || (block.type === "heading" && block.level === 1))) {
    throw new ValidationError("Bitte genau einen Abschnitt mit Inhalt auswählen. Gemeinsame Abschnitte können keine weiteren Abschnitte oder Seitentitel enthalten.");
  }
}

// Fills in a page's own values for the fields its shared section offers. Values for blocks
// the section no longer offers are ignored, so the centre always keeps control of the layout.
export function applyProps(content: Block[], overrides: SharedBlock["overrides"]): Block[] {
  const section = content[0];
  const props = section?.type === "section" ? section.props ?? [] : [];
  if (!overrides || props.length === 0) return content;
  return content.map((block) => {
    const values = props.includes(block.id) && Object.hasOwn(overrides, block.id) ? overrides[block.id] : undefined;
    const fields = PROP_FIELDS[block.type];
    if (!values || !fields) return block;
    return { ...block, ...Object.fromEntries(fields.filter((field) => values[field] !== undefined).map((field) => [field, values[field]])) } as Block;
  });
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
    result.push(...applyProps(content, block.overrides).map((item) => ({ ...item, id: `${block.id}-${item.id}` })));
    const next = blocks[index + 1];
    if (next && next.type !== "section" && next.type !== "shared") result.push({
      ...(running ?? { type: "section", background: "plain" }), id: `${block.id}-continuation`,
    });
  });
  return result;
}

// Leaves out hidden blocks; a hidden section takes its whole content with it.
export function visibleBlocks(blocks: Block[]): Block[] {
  let skipping = false;
  return blocks.filter((block) => {
    if (block.type === "section" || block.type === "shared") skipping = block.type === "section" && block.hidden === true;
    return !skipping && !block.hidden;
  });
}

// The shared sections that rules add to a page, before and after its own content.
// A page that already embeds a section by hand keeps just that one.
export function ruleBlocks(page: Pick<Page, "kind" | "blocks">, rules: LayoutRule[], shared: SharedSections = {}): { start: Block[]; end: Block[] } {
  const start: Block[] = [];
  const end: Block[] = [];
  if (page.kind === "section") return { start, end };
  for (const rule of rules) {
    if (!Object.hasOwn(shared, rule.sectionId) || page.blocks.some((block) => block.type === "shared" && block.sectionId === rule.sectionId)) continue;
    const applies = rule.place === "all-end" || (rule.place === "pages-end" ? page.kind === "page" : page.kind === "post");
    if (applies) (rule.place === "posts-start" ? start : end).push({ id: `rule-${rule.sectionId}`, type: "shared", sectionId: rule.sectionId });
  }
  return { start, end };
}

// Where rules put sections "at the start": after a banner or page title, so the title stays on top.
export function startIndex(blocks: Block[]): number {
  const first = blocks[0];
  return first && (first.type === "hero" || (first.type === "heading" && first.level === 1)) ? 1 : 0;
}

export function withLayoutRules(page: Pick<Page, "kind" | "blocks">, rules: LayoutRule[] = [], shared: SharedSections = {}): Block[] {
  const { start, end } = ruleBlocks(page, rules, shared);
  if (start.length === 0 && end.length === 0) return page.blocks;
  const at = startIndex(page.blocks);
  return [...page.blocks.slice(0, at), ...start, ...page.blocks.slice(at), ...end];
}

// Exactly what visitors get to see of a page: rules applied, shared sections expanded, hidden blocks gone.
export function liveContent(page: Pick<Page, "kind" | "blocks">, { sharedSections = {}, layoutRules = [] }: { sharedSections?: SharedSections; layoutRules?: LayoutRule[] }): Block[] {
  return visibleBlocks(expandSharedSections(visibleBlocks(withLayoutRules(page, layoutRules, sharedSections)), sharedSections));
}
