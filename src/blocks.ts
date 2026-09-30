// Content model shared by the server, the theme and the editor.
// A page is an ordered list of blocks; each block only stores content,
// never styling. Styling comes from the theme, so editors cannot break the design.

export type HeadingBlock = { id: string; type: "heading"; text: string };
export type TextBlock = { id: string; type: "text"; text: string };
export type ImageBlock = { id: string; type: "image"; src: string; alt: string };

export type Block = HeadingBlock | TextBlock | ImageBlock;
export type BlockType = Block["type"];

export type Page = {
  slug: string;
  title: string;
  blocks: Block[];
  updatedAt: string;
};

export const blockLabels: Record<BlockType, string> = {
  heading: "Überschrift",
  text: "Text",
  image: "Bild",
};

export function newBlock(type: BlockType, id: string = crypto.randomUUID()): Block {
  switch (type) {
    case "heading":
      return { id, type, text: "" };
    case "text":
      return { id, type, text: "" };
    case "image":
      return { id, type, src: "", alt: "" };
  }
}

export class ValidationError extends Error {}

const MAX_BLOCKS = 500;
const MAX_TEXT = 20_000;

// Validates untrusted input (e.g. a request body) and returns clean blocks.
// Unknown properties are dropped.
export function parseBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) throw new ValidationError("blocks muss eine Liste sein");
  if (input.length > MAX_BLOCKS) throw new ValidationError(`Höchstens ${MAX_BLOCKS} Blöcke erlaubt`);

  const ids = new Set<string>();
  return input.map((raw, index) => {
    const where = `Block ${index + 1}`;
    if (typeof raw !== "object" || raw === null) throw new ValidationError(`${where}: kein Objekt`);
    const value = raw as Record<string, unknown>;

    const id = string(value.id, `${where}.id`, 100);
    if (id === "") throw new ValidationError(`${where}.id darf nicht leer sein`);
    if (ids.has(id)) throw new ValidationError(`${where}.id ist doppelt`);
    ids.add(id);

    switch (value.type) {
      case "heading":
        return { id, type: "heading", text: string(value.text, `${where}.text`) };
      case "text":
        return { id, type: "text", text: string(value.text, `${where}.text`) };
      case "image": {
        const src = string(value.src, `${where}.src`, 2_000).trim();
        if (src !== "" && !isSafeImageSrc(src)) {
          throw new ValidationError(`${where}.src muss mit https://, http:// oder / beginnen`);
        }
        return { id, type: "image", src, alt: string(value.alt, `${where}.alt`, 500) };
      }
      default:
        throw new ValidationError(`${where}: unbekannter Typ ${JSON.stringify(value.type)}`);
    }
  });
}

export function isSafeImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src) || (src.startsWith("/") && !src.startsWith("//"));
}

function string(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== "string") throw new ValidationError(`${field} muss Text sein`);
  if (value.length > max) throw new ValidationError(`${field} ist zu lang`);
  return value;
}
