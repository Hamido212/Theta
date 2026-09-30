import type { Database } from "bun:sqlite";
import {
  BLOG,
  type Block,
  HOME,
  type NavItem,
  type Page,
  type PageKind,
  type Revision,
  type RevisionSummary,
  type SiteSettings,
  ValidationError,
  parseBlocks,
} from "./blocks";
import { type ThemeSettings, defaultTheme, parseTheme } from "./theme/tokens";

type PageRow = {
  slug: string;
  kind: string;
  title: string;
  description: string;
  in_nav: number;
  blocks: string;
  updated_at: string;
  published_at: string | null;
};

const PAGE_COLUMNS = "slug, kind, title, description, in_nav, blocks, updated_at, published_at";

// How many saved versions of each page are kept.
const MAX_REVISIONS = 50;

type RevisionRow = { id: number; title: string; description: string; in_nav: number; blocks: string; author: string; created_at: string };

// Paths the app itself uses; pages cannot take them.
const RESERVED_SLUGS = new Set([
  HOME,
  BLOG,
  "admin",
  "api",
  "assets",
  "edit",
  "feed.xml",
  "login",
  "logout",
  "media",
  "setup",
  "sitemap.xml",
  "robots.txt",
]);

export class PageStore {
  constructor(private db: Database) {
    if (!this.get(HOME)) this.insert(HOME, homePage, 0);
  }

  get(slug: string): Page | null {
    const row = this.db.query<PageRow, [string]>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE slug = ?`).get(slug);
    return row ? toPage(row) : null;
  }

  // A published post, or null for drafts and pages.
  post(slug: string): Page | null {
    const page = this.get(slug);
    return page?.kind === "post" && page.publishedAt ? page : null;
  }

  // All pages (not posts), home first, then in navigation order.
  list(): Page[] {
    return this.db
      .query<PageRow, []>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE kind = 'page' ORDER BY slug != 'home', position, title`)
      .all()
      .map(toPage);
  }

  // Blog posts, newest first. Drafts come first when they are included.
  posts({ drafts = false } = {}): Page[] {
    return this.db
      .query<PageRow, []>(
        `SELECT ${PAGE_COLUMNS} FROM pages WHERE kind = 'post' ${drafts ? "" : "AND published_at IS NOT NULL"}
         ORDER BY published_at IS NOT NULL, published_at DESC, updated_at DESC`,
      )
      .all()
      .map(toPage);
  }

  // Every page and post, e.g. to find the media they use.
  all(): Page[] {
    return [...this.list(), ...this.posts({ drafts: true })];
  }

  nav(): NavItem[] {
    const items: NavItem[] = this.list()
      .filter((page) => page.slug !== HOME && page.inNav)
      .map(({ slug, title }) => ({ slug, title }));
    // The blog shows up in the menu as soon as there is something to read.
    const hasPosts = this.db.query("SELECT 1 FROM pages WHERE kind = 'post' AND published_at IS NOT NULL LIMIT 1").get();
    if (hasPosts) items.push({ slug: BLOG, title: "Blog", href: `/${BLOG}` });
    return items;
  }

  // Creates a page or post from a title and returns it. The address is derived from the title.
  create(title: string, author = "", kind: PageKind = "page"): Page {
    const cleanTitle = parseTitle(title);
    const base = slugify(cleanTitle);
    let slug = base;
    for (let n = 2; RESERVED_SLUGS.has(slug) || this.get(slug); n++) slug = `${base}-${n}`;

    const { next } = this.db.query<{ next: number }, []>("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM pages").get()!;
    const blocks: Block[] = [{ id: crypto.randomUUID(), type: "heading", text: cleanTitle, level: 1 }];
    if (kind === "post") blocks.push({ id: crypto.randomUUID(), type: "text", text: "" });
    this.insert(slug, { title: cleanTitle, blocks, kind }, next);
    const page = this.get(slug)!;
    this.recordRevision(page, author);
    return page;
  }

  save(
    slug: string,
    changes: { title?: string; description?: string; inNav?: boolean; blocks?: Block[]; published?: boolean },
    author = "",
  ): Page {
    const page = this.get(slug);
    if (!page) throw new ValidationError("Seite nicht gefunden");
    const { published, ...rest } = changes;
    const defined = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
    const next = { ...page, ...defined };
    const publishedAt = page.kind === "post" && published !== undefined ? publicationDate(page, published) : page.publishedAt;
    this.db
      .query("UPDATE pages SET title = ?, description = ?, in_nav = ?, blocks = ?, updated_at = ?, published_at = ? WHERE slug = ?")
      .run(next.title, next.description, next.inNav ? 1 : 0, JSON.stringify(next.blocks), new Date().toISOString(), publishedAt, slug);
    const saved = this.get(slug)!;
    this.recordRevision(saved, author);
    return saved;
  }

  // Publishes a post or takes it back to a draft, without touching its content or history.
  publish(slug: string, published: boolean): Page {
    const page = this.get(slug);
    if (page?.kind !== "post") throw new ValidationError("Beitrag nicht gefunden");
    this.db.query("UPDATE pages SET published_at = ? WHERE slug = ?").run(publicationDate(page, published), slug);
    return this.get(slug)!;
  }

  // Saved versions of a page, newest first.
  revisions(slug: string): RevisionSummary[] {
    return this.db
      .query<RevisionSummary, [string]>(
        "SELECT id, title, author, created_at AS createdAt FROM revisions WHERE slug = ? ORDER BY id DESC",
      )
      .all(slug);
  }

  revision(slug: string, id: number): Revision | null {
    const row = this.db
      .query<RevisionRow, [string, number]>("SELECT * FROM revisions WHERE slug = ? AND id = ?")
      .get(slug, id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      inNav: row.in_nav === 1,
      blocks: parseBlocks(JSON.parse(row.blocks)),
      author: row.author,
      createdAt: row.created_at,
    };
  }

  private recordRevision(page: Page, author: string) {
    this.db
      .query("INSERT INTO revisions (slug, title, description, in_nav, blocks, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(page.slug, page.title, page.description, page.inNav ? 1 : 0, JSON.stringify(page.blocks), author, page.updatedAt);
    this.db
      .query(
        `DELETE FROM revisions WHERE slug = ? AND id NOT IN
           (SELECT id FROM revisions WHERE slug = ? ORDER BY id DESC LIMIT ${MAX_REVISIONS})`,
      )
      .run(page.slug, page.slug);
  }

  delete(slug: string) {
    if (slug === HOME) throw new ValidationError("Die Startseite kann nicht gelöscht werden");
    this.db.query("DELETE FROM pages WHERE slug = ?").run(slug);
    this.db.query("DELETE FROM revisions WHERE slug = ?").run(slug);
  }

  // Moves a page one step up (-1) or down (1) in the navigation order.
  move(slug: string, delta: -1 | 1) {
    const order = this.list().filter((page) => page.slug !== HOME).map((page) => page.slug);
    const index = order.indexOf(slug);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    this.db.transaction(() => {
      order.forEach((s, i) => this.db.query("UPDATE pages SET position = ? WHERE slug = ?").run(i + 1, s));
    })();
  }

  private insert(slug: string, page: { title: string; blocks: Block[]; kind?: PageKind }, position: number) {
    const kind = page.kind ?? "page";
    this.db
      .query("INSERT INTO pages (slug, kind, title, description, in_nav, position, blocks, updated_at) VALUES (?, ?, ?, '', ?, ?, ?, ?)")
      .run(slug, kind, page.title, kind === "page" ? 1 : 0, position, JSON.stringify(page.blocks), new Date().toISOString());
  }
}

export class SettingsStore {
  constructor(private db: Database) {}

  site(): SiteSettings {
    return { ...defaultSite, ...(this.get("site") as Partial<SiteSettings> | null) };
  }

  theme(): ThemeSettings {
    const stored = this.get("theme");
    if (!stored) return defaultTheme();
    try {
      return parseTheme({ ...defaultTheme(), ...stored });
    } catch {
      return defaultTheme();
    }
  }

  saveTheme(input: Record<string, unknown>): ThemeSettings {
    const theme = parseTheme(input);
    this.set("theme", theme);
    return theme;
  }

  saveSite(input: { name: unknown; description: unknown }): SiteSettings {
    const site = {
      name: text(input.name, "Name", 1, 100),
      description: text(input.description, "Beschreibung", 0, 300),
    };
    this.set("site", site);
    return site;
  }

  private get(key: string): Record<string, unknown> | null {
    const row = this.db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? (JSON.parse(row.value) as Record<string, unknown>) : null;
  }

  private set(key: string, value: object) {
    this.db
      .query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  }
}

export function parseTitle(value: unknown): string {
  return text(value, "Titel", 1, 200);
}

export function parseDescription(value: unknown): string {
  return text(value, "Beschreibung", 0, 300);
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ValidationError(`${field} muss Text sein`);
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length < min) throw new ValidationError(`${field} darf nicht leer sein`);
  if (clean.length > max) throw new ValidationError(`${field} darf höchstens ${max} Zeichen lang sein`);
  return clean;
}

// "Über uns & Kontakt" becomes "ueber-uns-kontakt".
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return slug || "seite";
}

// Publishing keeps the date a post first went public; taking it back to a draft clears it.
function publicationDate(page: Page, published: boolean): string | null {
  return published ? (page.publishedAt ?? new Date().toISOString()) : null;
}

function toPage(row: PageRow): Page {
  return {
    slug: row.slug,
    kind: row.kind === "post" ? "post" : "page",
    title: row.title,
    description: row.description,
    inNav: row.in_nav === 1,
    blocks: parseBlocks(JSON.parse(row.blocks)),
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

const defaultSite: SiteSettings = { name: "Meine Website", description: "" };

const homePage: { title: string; blocks: Block[] } = {
  title: "Willkommen bei Theta",
  blocks: [
    { id: "welcome-heading", type: "heading", text: "Willkommen bei Theta", level: 1 },
    {
      id: "welcome-text",
      type: "text",
      text:
        "Das ist deine erste Seite. Öffne /edit, klick auf diesen Text und schreib einfach los.\n\n" +
        "Farben, Schriften und Abstände kommen aus dem Theme. Du kümmerst dich nur um den Inhalt, und die Seite sieht trotzdem immer stimmig aus.",
    },
    { id: "welcome-image", type: "image", src: "/media/theta.svg", alt: "Das griechische Zeichen Theta", caption: "", width: "normal" },
  ],
};
