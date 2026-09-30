// Content model shared by the server, the theme and the editor.
// A page is an ordered list of blocks; each block only stores content,
// never styling. Styling comes from the theme, so editors cannot break the design.

// Level 1 is the page title (one per page), 2 a section heading, 3 a smaller subheading.
export type HeadingLevel = 1 | 2 | 3;
export type HeadingBlock = { id: string; type: "heading"; text: string; level: HeadingLevel };
export type TextBlock = { id: string; type: "text"; text: string };
// Wide images break out of the text column, full ones span the whole window.
export type ImageWidth = "normal" | "wide" | "full";
export type ImageBlock = { id: string; type: "image"; src: string; alt: string; caption: string; width: ImageWidth };
export type GalleryBlock = { id: string; type: "gallery"; images: { src: string; alt: string }[] };
export type ButtonBlock = { id: string; type: "button"; label: string; href: string; variant: "primary" | "secondary" };
export type ColumnsBlock = { id: string; type: "columns"; items: { title: string; text: string }[] };
export type VideoBlock = { id: string; type: "video"; url: string; title: string };
export type QuoteBlock = { id: string; type: "quote"; text: string; cite: string };
export type DividerBlock = { id: string; type: "divider" };
// Starts a new full-width band of the page. Everything up to the next section shares its background.
export type SectionBackground = "plain" | "soft" | "accent" | "inverse";
export type SectionBlock = { id: string; type: "section"; background: SectionBackground };
// A large picture across the whole window with the page title, a sentence and up to two buttons on top.
export type HeroButton = { label: string; href: string };
export type HeroBlock = { id: string; type: "hero"; title: string; text: string; src: string; alt: string; buttons: HeroButton[] };

export type Block =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | GalleryBlock
  | ButtonBlock
  | ColumnsBlock
  | VideoBlock
  | QuoteBlock
  | DividerBlock
  | SectionBlock
  | HeroBlock;
export type BlockType = Block["type"];

export type PageKind = "page" | "post";

export type Page = {
  slug: string;
  // Pages form the site structure; posts are dated blog entries under /blog.
  kind: PageKind;
  title: string;
  // Short summary for search engines and link previews.
  description: string;
  // Whether the page is listed in the site navigation.
  inNav: boolean;
  blocks: Block[];
  updatedAt: string;
  // Posts only: when it went public; null while it is a draft.
  publishedAt: string | null;
};

// Slug of the start page, served at "/".
export const HOME = "home";

export const BLOG = "blog";

export const publicPath = (slug: string) => (slug === HOME ? "/" : `/${slug}`);
export const editPath = (slug: string) => (slug === HOME ? "/edit" : `/edit/${slug}`);
export const pagePath = (page: Pick<Page, "slug" | "kind">) =>
  page.kind === "post" ? `/${BLOG}/${page.slug}` : publicPath(page.slug);

// A saved state of a page in its history.
export type RevisionSummary = { id: number; title: string; author: string; createdAt: string };
export type Revision = RevisionSummary & Pick<Page, "description" | "inNav" | "blocks">;

// "30. September 2026"
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { dateStyle: "long" });

const excerptLength = 220;

// A short teaser: the description, or else the start of the first text.
export function excerpt(page: Page): string {
  if (page.description) return page.description;
  const text = page.blocks.find((block) => block.type === "text")?.text.replace(/\s+/g, " ").trim() ?? "";
  return text.length > excerptLength ? `${text.slice(0, excerptLength).replace(/\s+\S*$/, "")} …` : text;
}

export type SiteSettings = {
  name: string;
  description: string;
};

// href overrides the address for entries that are not pages, such as the blog.
export type NavItem = { slug: string; title: string; href?: string };

// Size and responsive sources of an uploaded image, used for srcset and to avoid layout jumps.
export type ImageInfo = { width: number; height: number; srcset: string };

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
  section: "Abschnitt",
  hero: "Titelbild",
};

export const sectionBackgrounds: Record<SectionBackground, string> = {
  plain: "Normal",
  soft: "Getönt",
  accent: "Akzentfarbe",
  inverse: "Kontrast",
};

export const MAX_HERO_BUTTONS = 2;

export const MAX_COLUMNS = 4;
export const MAX_GALLERY_IMAGES = 60;

export function newBlock(type: BlockType, id: string = crypto.randomUUID()): Block {
  switch (type) {
    case "heading":
      return { id, type, text: "", level: 2 };
    case "text":
      return { id, type, text: "" };
    case "image":
      return { id, type, src: "", alt: "", caption: "", width: "normal" };
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
    case "section":
      return { id, type, background: "soft" };
    case "hero":
      return { id, type, title: "", text: "", src: "", alt: "", buttons: [emptyHeroButton()] };
  }
}

export const emptyHeroButton = (): HeroButton => ({ label: "", href: "" });

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
  // Headings saved before levels existed: the first one was the page title, the rest become section headings.
  let hasTitle = false;
  return input.map((raw, index): Block => {
    const where = `Block ${index + 1}`;
    if (typeof raw !== "object" || raw === null) throw new ValidationError(`${where}: kein Objekt`);
    const value = raw as Record<string, unknown>;

    const id = string(value.id, `${where}.id`, 100);
    if (id === "") throw new ValidationError(`${where}.id darf nicht leer sein`);
    if (ids.has(id)) throw new ValidationError(`${where}.id ist doppelt`);
    ids.add(id);

    switch (value.type) {
      case "heading": {
        const level = value.level === undefined ? (hasTitle ? 2 : 1) : headingLevel(value.level, `${where}.level`);
        hasTitle ||= level === 1;
        return { id, type: "heading", text: string(value.text, `${where}.text`), level };
      }
      case "text":
        return { id, type: "text", text: string(value.text, `${where}.text`) };
      case "image":
        return {
          id,
          type: "image",
          ...image(value, where),
          caption: value.caption === undefined ? "" : string(value.caption, `${where}.caption`, 500),
          width: value.width === "wide" || value.width === "full" ? value.width : "normal",
        };
      case "gallery": {
        const images = list(value.images, `${where}.images`, MAX_GALLERY_IMAGES);
        return { id, type: "gallery", images: images.map((item, i) => image(object(item, `${where}.images[${i}]`), `${where}.images[${i}]`)) };
      }
      case "button": {
        const variant = value.variant === "secondary" ? "secondary" : "primary";
        return { id, type: "button", label: string(value.label, `${where}.label`, 200), href: href(value.href, `${where}.href`), variant };
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
      case "section":
        return { id, type: "section", background: Object.hasOwn(sectionBackgrounds, value.background as string) ? (value.background as SectionBackground) : "plain" };
      case "hero": {
        // The hero's title is the page title.
        hasTitle = true;
        const buttons = list(value.buttons, `${where}.buttons`, MAX_HERO_BUTTONS).map((item, i) => {
          const button = object(item, `${where}.buttons[${i}]`);
          return { label: string(button.label, `${where}.buttons[${i}].label`, 200), href: href(button.href, `${where}.buttons[${i}].href`) };
        });
        return { id, type: "hero", title: string(value.title, `${where}.title`, 500), text: string(value.text, `${where}.text`, 2_000), ...image(value, where), buttons };
      }
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

function href(value: unknown, field: string): string {
  const link = string(value, field, 2_000).trim();
  if (link !== "" && !isSafeHref(link)) {
    throw new ValidationError(`${field} muss mit https://, http://, mailto:, tel: oder / beginnen`);
  }
  return link;
}

function headingLevel(value: unknown, field: string): HeadingLevel {
  if (value === 1 || value === 2 || value === 3) return value;
  throw new ValidationError(`${field} muss 1, 2 oder 3 sein`);
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
