// Content model shared by the server, the theme and the editor.
// A page is an ordered list of blocks; each block only stores content,
// never styling. Styling comes from the theme, so editors cannot break the design.

export type HeadingBlock = { id: string; type: "heading"; text: string };
export type TextBlock = { id: string; type: "text"; text: string };
export type ImageBlock = { id: string; type: "image"; src: string; alt: string };
export type GalleryBlock = { id: string; type: "gallery"; images: { src: string; alt: string }[] };
export type ButtonBlock = { id: string; type: "button"; label: string; href: string; variant: "primary" | "secondary" };
export type ColumnsBlock = { id: string; type: "columns"; items: { title: string; text: string }[] };
export type VideoBlock = { id: string; type: "video"; url: string; title: string };
export type QuoteBlock = { id: string; type: "quote"; text: string; cite: string };
export type DividerBlock = { id: string; type: "divider" };

export type Block =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | GalleryBlock
  | ButtonBlock
  | ColumnsBlock
  | VideoBlock
  | QuoteBlock
  | DividerBlock;
export type BlockType = Block["type"];

export type Page = {
  slug: string;
  title: string;
  // Short summary for search engines and link previews.
  description: string;
  // Whether the page is listed in the site navigation.
  inNav: boolean;
  blocks: Block[];
  updatedAt: string;
};

// Slug of the start page, served at "/".
export const HOME = "home";

export const publicPath = (slug: string) => (slug === HOME ? "/" : `/${slug}`);
export const editPath = (slug: string) => (slug === HOME ? "/edit" : `/edit/${slug}`);

export type SiteSettings = {
  name: string;
  description: string;
};

export type NavItem = { slug: string; title: string };

export const blockLabels: Record<BlockType, string> = {
  heading: "Überschrift",
  text: "Text",
  image: "Bild",
  gallery: "Galerie",
  button: "Button",
  columns: "Spalten",
  video: "Video",
  quote: "Zitat",
  divider: "Trenner",
};

export const MAX_COLUMNS = 4;
export const MAX_GALLERY_IMAGES = 60;

export function newBlock(type: BlockType, id: string = crypto.randomUUID()): Block {
  switch (type) {
    case "heading":
      return { id, type, text: "" };
    case "text":
      return { id, type, text: "" };
    case "image":
      return { id, type, src: "", alt: "" };
    case "gallery":
      return { id, type, images: [] };
    case "button":
      return { id, type, label: "", href: "", variant: "primary" };
    case "columns":
      return { id, type, items: [emptyColumn(), emptyColumn()] };
    case "video":
      return { id, type, url: "", title: "" };
    case "quote":
      return { id, type, text: "", cite: "" };
    case "divider":
      return { id, type };
  }
}

export const emptyColumn = () => ({ title: "", text: "" });

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
      case "image":
        return { id, type: "image", ...image(value, where) };
      case "gallery": {
        const images = list(value.images, `${where}.images`, MAX_GALLERY_IMAGES);
        return { id, type: "gallery", images: images.map((item, i) => image(object(item, `${where}.images[${i}]`), `${where}.images[${i}]`)) };
      }
      case "button": {
        const href = string(value.href, `${where}.href`, 2_000).trim();
        if (href !== "" && !isSafeHref(href)) {
          throw new ValidationError(`${where}.href muss mit https://, http://, mailto:, tel: oder / beginnen`);
        }
        const variant = value.variant === "secondary" ? "secondary" : "primary";
        return { id, type: "button", label: string(value.label, `${where}.label`, 200), href, variant };
      }
      case "columns": {
        const items = list(value.items, `${where}.items`, MAX_COLUMNS);
        return {
          id,
          type: "columns",
          items: items.map((item, i) => {
            const column = object(item, `${where}.items[${i}]`);
            return { title: string(column.title, `${where}.items[${i}].title`, 500), text: string(column.text, `${where}.items[${i}].text`) };
          }),
        };
      }
      case "video": {
        const url = string(value.url, `${where}.url`, 2_000).trim();
        if (url !== "" && !isSafeImageSrc(url)) {
          throw new ValidationError(`${where}.url muss mit https://, http:// oder / beginnen`);
        }
        return { id, type: "video", url, title: string(value.title, `${where}.title`, 500) };
      }
      case "quote":
        return { id, type: "quote", text: string(value.text, `${where}.text`), cite: string(value.cite, `${where}.cite`, 500) };
      case "divider":
        return { id, type: "divider" };
      default:
        throw new ValidationError(`${where}: unbekannter Typ ${JSON.stringify(value.type)}`);
    }
  });
}

export function isSafeImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src) || (src.startsWith("/") && !src.startsWith("//"));
}

export function isSafeHref(href: string): boolean {
  return isSafeImageSrc(href) || /^(mailto|tel):/i.test(href) || href.startsWith("#");
}

function image(value: Record<string, unknown>, where: string) {
  const src = string(value.src, `${where}.src`, 2_000).trim();
  if (src !== "" && !isSafeImageSrc(src)) {
    throw new ValidationError(`${where}.src muss mit https://, http:// oder / beginnen`);
  }
  return { src, alt: string(value.alt, `${where}.alt`, 500) };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ValidationError(`${field}: kein Objekt`);
  return value as Record<string, unknown>;
}

function list(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(`${field} muss eine Liste sein`);
  if (value.length > max) throw new ValidationError(`${field}: höchstens ${max} Einträge`);
  return value;
}

function string(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== "string") throw new ValidationError(`${field} muss Text sein`);
  if (value.length > max) throw new ValidationError(`${field} ist zu lang`);
  return value;
}
