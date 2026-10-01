import { type Block, ValidationError, parseBlocks } from "../blocks";
import { applyProps, type SharedSectionData } from "../shared-sections";
import { copyBlocks } from "./sections";

// Blocks travel through the system clipboard as JSON, so a section copied on one Theta
// site can be pasted on another. Pictures carry their full address; the receiving site
// copies them into its own media library.

const MARK = "theta-blocks";
type Payload = { [MARK]: 1; origin: string; blocks: unknown };

// Shared sections become independent copies, since the other site does not have them.
export function toClipboard(blocks: Block[], shared: SharedSectionData[], origin: string): string {
  const plain = blocks.flatMap((block): Block[] => {
    if (block.type !== "shared") return [block];
    const item = shared.find((entry) => entry.page.slug === block.sectionId);
    if (!item) return [];
    return applyProps(item.liveBlocks ?? item.page.blocks, block.overrides).map((inner) => {
      if (inner.type !== "section") return inner;
      const { props: _props, ...section } = inner;
      return section;
    });
  });
  // Fresh ids, so a shared section can be copied together with blocks it was made from.
  const payload: Payload = { [MARK]: 1, origin, blocks: copyBlocks(plain) };
  return JSON.stringify(payload).replaceAll('"/media/', `"${origin}/media/`);
}

export type Pasted = { blocks: Block[]; images: string[] };

// Null when the text is not something Theta copied, so ordinary pasting goes on as usual.
export function fromClipboard(text: string, origin: string): Pasted | null {
  if (!text.includes(MARK)) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(text) as Payload;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null || payload[MARK] !== 1) return null;
  // Pictures from this very site get their short address back.
  const local = JSON.stringify(payload.blocks).replaceAll(`"${origin}/media/`, '"/media/');
  let blocks: Block[];
  try {
    blocks = parseBlocks(JSON.parse(local));
  } catch (err) {
    if (err instanceof ValidationError) throw new ValidationError(`Die kopierten Blöcke passen nicht zu dieser Theta-Version: ${err.message}`);
    throw err;
  }
  if (blocks.length === 0) return null;
  const images = new Set<string>();
  for (const [, url] of JSON.stringify(blocks).matchAll(/"(https?:\/\/[^"/]+\/media\/[\w-]+\/[\w.-]+)"/g)) images.add(url!);
  return { blocks: copyBlocks(blocks), images: [...images] };
}

// Points every use of a copied picture at its new place in this site's library.
export function replaceImage(blocks: Block[], from: string, to: string): Block[] {
  return JSON.parse(JSON.stringify(blocks).replaceAll(JSON.stringify(from), JSON.stringify(to))) as Block[];
}
