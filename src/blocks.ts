// Content model shared by the server, the theme and the editor.
// A page is an ordered list of blocks; each block only stores content,
// never styling. Styling comes from the theme, so editors cannot break the design.

import { plainText } from "./richtext";

// Level 1 is the page title (one per page), 2 a section heading, 3 a smaller subheading.
export type HeadingLevel = 1 | 2 | 3;
export type HeadingBlock = { id: string; type: "heading"; text: string; level: HeadingLevel };
export type TextBlock = { id: string; type: "text"; text: string };
// Wide images break out of the text column, full ones span the whole window.
export type FocalPoint = { x: number; y: number };
export type ImageContent = { src: string; alt: string; focal?: FocalPoint };
export type ImageWidth = "normal" | "wide" | "full";
export type ImageBlock = { id: string; type: "image"; src: string; alt: string; focal?: FocalPoint; caption: string; width: ImageWidth };
// Galleries show 2 to 4 pictures per row, cropped to squares or in their own proportions.
export type GalleryBlock = { id: string; type: "gallery"; images: ImageContent[]; columns: 2 | 3 | 4; crop: boolean };
export type ButtonBlock = { id: string; type: "button"; label: string; href: string; variant: "primary" | "secondary" };
// Columns use a text grid, picture cards, stacked cards or a dated timeline.
export type Column = { focal?: FocalPoint; title: string; text: string; src: string; alt: string; href: string; linkLabel: string; meta?: string; tags?: string[] };
export type ColumnsBlock = { id: string; type: "columns"; style: "plain" | "cards" | "list" | "timeline"; items: Column[]; heading?: string; href?: string; linkLabel?: string };
export type VideoBlock = { id: string; type: "video"; url: string; title: string };
export type QuoteBlock = { id: string; type: "quote"; text: string; cite: string };
export type DividerBlock = { id: string; type: "divider" };
// Starts a new full-width band of the page. Everything up to the next section shares its background.
export type SectionBackground = "plain" | "soft" | "accent" | "inverse";
export type SectionBlock = { id: string; type: "section"; background: SectionBackground; width?: "content" | "wide" | "full"; spacing?: "compact" | "normal" | "spacious"; align?: "left" | "center" };
// References a centrally edited section; its draft is never rendered on live pages.
export type SharedBlock = { id: string; type: "shared"; sectionId: string };
// A full-width banner or compact profile, with title, text and up to two buttons.
export type HeroButton = { label: string; href: string };
export type HeroBlock = { id: string; type: "hero"; focal?: FocalPoint; title: string; text: string; src: string; alt: string; buttons: HeroButton[]; width?: "content" | "wide" | "full"; layout?: "banner" | "profile"; eyebrow?: string; highlight?: string; links?: HeroButton[] };
// A menu or price list: name and price on one line, an optional description below.
export type PriceItem = { name: string; description: string; price: string };
export type PricesBlock = { id: string; type: "prices"; items: PriceItem[] };
// Frequently asked questions; each answer opens when its question is clicked.
export type FaqItem = { question: string; answer: string };
export type FaqBlock = { id: string; type: "faq"; items: FaqItem[] };
// Opening hours as a small table, e.g. "Montag bis Freitag" – "8 bis 18 Uhr", plus a note.
export type HoursRow = { days: string; time: string };
export type HoursBlock = { id: string; type: "hours"; rows: HoursRow[]; note: string };
// People with a photo, name, role and a few words.
export type TeamMember = { focal?: FocalPoint; name: string; role: string; text: string; src: string; alt: string };
export type TeamBlock = { id: string; type: "team"; members: TeamMember[] };

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
  | SharedBlock
  | HeroBlock
  | PricesBlock
  | FaqBlock
  | HoursBlock
  | TeamBlock;
export type BlockType = Block["type"];

export type PageKind = "page" | "post" | "section";

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
  // When the first live version went public; null while it is a draft.
  publishedAt: string | null;
  version: number;
  hasChanges: boolean;
  deletedAt: string | null;
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

// "30. September 2026" or "Sep 30, 2026" in the site's public language.
export const formatDate = (iso: string, language: "de" | "en" = "de") => new Date(iso).toLocaleDateString(language === "en" ? "en-US" : "de-DE", language === "en" ? { month: "short", day: "2-digit", year: "numeric" } : { dateStyle: "long" });

const excerptLength = 220;

// A short teaser: the description, or else the start of the first text.
export function excerpt(page: Page): string {
  if (page.description) return page.description;
  const first = page.blocks.find((block) => block.type === "text");
  const text = first ? plainText(first.text).replace(/\s+/g, " ").trim() : "";
  return text.length > excerptLength ? `${text.slice(0, excerptLength).replace(/\s+\S*$/, "")} …` : text;
}

export type SiteSettings = {
  name: string;
  description: string;
  // Older sites default to German. This is the public content language, not the editor language.
  language?: "de" | "en";
  // Address of an uploaded logo shown in the header instead of the name; empty for none.
  logo: string;
  // Formatted text for the footer, e.g. address, opening hours and social links.
  footer: string;
  // Pages linked in the footer as legal notice (Impressum) and privacy policy; empty for none.
  imprint: string;
  privacy: string;
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
  shared: "Gemeinsamer Abschnitt",
  hero: "Titelbild",
  prices: "Preisliste",
  faq: "Fragen & Antworten",
  hours: "Öffnungszeiten",
  team: "Team",
};

export const sectionBackgrounds: Record<SectionBackground, string> = {
  plain: "Normal",
  soft: "Getönt",
  accent: "Akzentfarbe",
  inverse: "Kontrast",
};

export const MAX_HERO_BUTTONS = 2;

export const MAX_COLUMNS = 4;
export const MAX_LIST_ITEMS = 100;
export const MAX_HOURS_ROWS = 14;
export const MAX_TEAM = 24;
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
      return { id, type, images: [], columns: 3, crop: true };
    case "button":
      return { id, type, label: "", href: "", variant: "primary" };
    case "columns":
      return { id, type, style: "cards", items: [emptyColumn(), emptyColumn(), emptyColumn()] };
    case "video":
      return { id, type, url: "", title: "" };
    case "quote":
      return { id, type, text: "", cite: "" };
    case "divider":
      return { id, type };
    case "section":
      return { id, type, background: "soft" };
    case "shared":
      return { id, type, sectionId: "" };
    case "hero":
      return { id, type, title: "", text: "", src: "", alt: "", buttons: [emptyHeroButton()] };
    case "prices":
      return { id, type, items: [emptyPriceItem(), emptyPriceItem(), emptyPriceItem()] };
    case "faq":
      return { id, type, items: [emptyFaqItem(), emptyFaqItem()] };
    case "hours":
      return {
        id,
        type,
        rows: [
          { days: "Montag bis Freitag", time: "" },
          { days: "Samstag", time: "" },
          { days: "Sonntag", time: "geschlossen" },
        ],
        note: "",
      };
    case "team":
      return { id, type, members: [emptyTeamMember(), emptyTeamMember(), emptyTeamMember()] };
  }
}

export const emptyPriceItem = (): PriceItem => ({ name: "", description: "", price: "" });
export const emptyFaqItem = (): FaqItem => ({ question: "", answer: "" });
export const emptyHoursRow = (): HoursRow => ({ days: "", time: "" });
export const emptyTeamMember = (): TeamMember => ({ name: "", role: "", text: "", src: "", alt: "" });

export const emptyHeroButton = (): HeroButton => ({ label: "", href: "" });

export const emptyColumn = (): Column => ({ title: "", text: "", src: "", alt: "", href: "", linkLabel: "" });

export class ValidationError extends Error {
  // Index of the block the problem is in, so the editor can point at it.
  constructor(
    message: string,
    readonly block?: number,
  ) {
    super(message);
  }
}

// Field paths in messages ("Block 3.images[1].src") become words people understand
// ("Block 3 (Galerie), Bild 2: Die Bild-Adresse").
const FIELD_NAMES: [RegExp, string][] = [
  [/\.images\[(\d+)\]/g, ", Bild $1"],
  [/\.items\[(\d+)\]/g, ", $item $1"],
  [/\.buttons\[(\d+)\]/g, ", Button $1"],
  [/\.rows\[(\d+)\]/g, ", Zeile $1"],
  [/\.members\[(\d+)\]/g, ", Person $1"],
  [/\.(src)\b/g, ": Die Bild-Adresse"],
  [/\.(href)\b/g, ": Das Link-Ziel"],
  [/\.(url)\b/g, ": Die Video-Adresse"],
  [/\.(alt)\b/g, ": Die Bildbeschreibung"],
  [/\.(caption)\b/g, ": Die Bildunterschrift"],
  [/\.(title)\b/g, ": Der Titel"],
  [/\.(text)\b/g, ": Der Text"],
  [/\.(label|linkLabel)\b/g, ": Die Beschriftung"],
  [/\.(cite)\b/g, ": Die Quelle"],
  [/\.(name)\b/g, ": Der Name"],
  [/\.(price)\b/g, ": Der Preis"],
  [/\.(description)\b/g, ": Die Beschreibung"],
  [/\.(question)\b/g, ": Die Frage"],
  [/\.(answer)\b/g, ": Die Antwort"],
  [/\.(role)\b/g, ": Die Aufgabe"],
  [/\.(level)\b/g, ": Die Art der Überschrift"],
];

function friendly(message: string, index: number, type: unknown): string {
  const label = Object.hasOwn(blockLabels, type as string) ? ` (${blockLabels[type as BlockType]})` : "";
  let text = message.replace(`Block ${index + 1}`, `Block ${index + 1}${label}`);
  for (const [pattern, words] of FIELD_NAMES) {
    text = text.replace(pattern, (_, n: string) => (words.includes("$1") ? words.replace("$1", String(Number(n) + 1)) : words));
  }
  return text.replace("$item", type === "columns" ? "Spalte" : "Eintrag");
}

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
    try {
      return parseBlock(raw, index);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      throw new ValidationError(friendly(err.message, index, (raw as { type?: unknown } | null)?.type), index);
    }
  });

  function parseBlock(raw: unknown, index: number): Block {
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
        return {
          id,
          type: "gallery",
          images: images.map((item, i) => image(object(item, `${where}.images[${i}]`), `${where}.images[${i}]`)),
          columns: value.columns === 2 || value.columns === 4 ? value.columns : 3,
          crop: value.crop !== false,
        };
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
          // Columns saved before cards existed stay plain.
          style: value.style === "cards" || value.style === "list" || value.style === "timeline" ? value.style : "plain",
          ...(value.heading !== undefined && { heading: string(value.heading, `${where}.heading`, 200) }),
          ...(value.href !== undefined && { href: href(value.href, `${where}.href`) }),
          ...(value.linkLabel !== undefined && { linkLabel: string(value.linkLabel, `${where}.linkLabel`, 200) }),
          items: items.map((item, i) => {
            const at = `${where}.items[${i}]`;
            const column = object(item, at);
            return {
              title: string(column.title, `${at}.title`, 500),
              text: string(column.text, `${at}.text`),
              ...image({ src: column.src ?? "", alt: column.alt ?? "", focal: column.focal }, at),
              href: href(column.href ?? "", `${at}.href`),
              linkLabel: string(column.linkLabel ?? "", `${at}.linkLabel`, 200),
              ...(column.meta !== undefined && { meta: string(column.meta, `${at}.meta`, 200) }),
              ...(column.tags !== undefined && { tags: list(column.tags, `${at}.tags`, 12).map((tag, n) => string(tag, `${at}.tags[${n}]`, 100)) }),
            };
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
        return {
          id, type: "section", background: Object.hasOwn(sectionBackgrounds, value.background as string) ? (value.background as SectionBackground) : "plain",
          ...(value.width !== undefined && { width: value.width === "wide" || value.width === "full" ? value.width : "content" }),
          ...(value.spacing !== undefined && { spacing: value.spacing === "compact" || value.spacing === "spacious" ? value.spacing : "normal" }),
          ...(value.align !== undefined && { align: value.align === "center" ? "center" : "left" }),
        };
      case "shared": {
        const sectionId = string(value.sectionId, `${where}.sectionId`, 100);
        if (!/^[a-z0-9-]+$/.test(sectionId)) throw new ValidationError(`${where}: Bitte einen gemeinsamen Abschnitt auswählen`);
        return { id, type: "shared", sectionId };
      }
      case "hero": {
        // The hero's title is the page title.
        hasTitle = true;
        const buttons = list(value.buttons, `${where}.buttons`, MAX_HERO_BUTTONS).map((item, i) => {
          const button = object(item, `${where}.buttons[${i}]`);
          return { label: string(button.label, `${where}.buttons[${i}].label`, 200), href: href(button.href, `${where}.buttons[${i}].href`) };
        });
        return {
          id, type: "hero", title: string(value.title, `${where}.title`, 500), text: string(value.text, `${where}.text`, 2_000), ...image(value, where), buttons,
          ...(value.width !== undefined && { width: value.width === "wide" || value.width === "full" ? value.width : "content" }),
          ...(value.layout !== undefined && { layout: value.layout === "profile" ? "profile" : "banner" }),
          ...(value.eyebrow !== undefined && { eyebrow: string(value.eyebrow, `${where}.eyebrow`, 200) }),
          ...(value.highlight !== undefined && { highlight: string(value.highlight, `${where}.highlight`, 200) }),
          ...(value.links !== undefined && { links: records(value.links, `${where}.links`, 8, (link, at) => ({ label: string(link.label, `${at}.label`, 200), href: href(link.href, `${at}.href`) })) }),
        };
      }
      case "prices":
        return {
          id,
          type: "prices",
          items: records(value.items, `${where}.items`, MAX_LIST_ITEMS, (item, at) => ({
            name: string(item.name, `${at}.name`, 500),
            description: string(item.description, `${at}.description`, 2_000),
            price: string(item.price, `${at}.price`, 100),
          })),
        };
      case "faq":
        return {
          id,
          type: "faq",
          items: records(value.items, `${where}.items`, MAX_LIST_ITEMS, (item, at) => ({
            question: string(item.question, `${at}.question`, 500),
            answer: string(item.answer, `${at}.answer`),
          })),
        };
      case "hours":
        return {
          id,
          type: "hours",
          rows: records(value.rows, `${where}.rows`, MAX_HOURS_ROWS, (row, at) => ({
            days: string(row.days, `${at}.days`, 200),
            time: string(row.time, `${at}.time`, 200),
          })),
          note: string(value.note, `${where}.note`, 2_000),
        };
      case "team":
        return {
          id,
          type: "team",
          members: records(value.members, `${where}.members`, MAX_TEAM, (member, at) => ({
            name: string(member.name, `${at}.name`, 200),
            role: string(member.role, `${at}.role`, 200),
            text: string(member.text, `${at}.text`, 2_000),
            ...image(member, at),
          })),
        };
      default:
        throw new ValidationError(`${where}: unbekannter Typ ${JSON.stringify(value.type)}`);
    }
  }
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
  let focal: FocalPoint | undefined;
  if (value.focal !== undefined) {
    const point = object(value.focal, `${where}.focal`);
    if (![point.x, point.y].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) {
      throw new ValidationError(`${where}: Der Bild-Fokuspunkt muss innerhalb des Bildes liegen`);
    }
    focal = { x: point.x as number, y: point.y as number };
  }
  return { src, alt: string(value.alt, `${where}.alt`, 500), ...(focal && { focal }) };
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

// A list of objects, each checked by parse with its own position for error messages.
function records<T>(value: unknown, field: string, max: number, parse: (item: Record<string, unknown>, at: string) => T): T[] {
  return list(value, field, max).map((item, i) => parse(object(item, `${field}[${i}]`), `${field}[${i}]`));
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
