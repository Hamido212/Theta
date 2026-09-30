import type { Database } from "bun:sqlite";
import { type Block, HOME, type NavItem, type Page, type SiteSettings, ValidationError, parseBlocks } from "./blocks";

type PageRow = {
  slug: string;
  title: string;
  description: string;
  in_nav: number;
  blocks: string;
  updated_at: string;
};

// Paths the app itself uses; pages cannot take them.
const RESERVED_SLUGS = new Set([HOME, "admin", "api", "assets", "edit", "login", "logout", "media", "setup", "sitemap.xml", "robots.txt"]);

export class PageStore {
  constructor(private db: Database) {
    if (!this.get(HOME)) this.insert(HOME, homePage, 0);
  }

  get(slug: string): Page | null {
    const row = this.db
      .query<PageRow, [string]>("SELECT slug, title, description, in_nav, blocks, updated_at FROM pages WHERE slug = ?")
      .get(slug);
    return row ? toPage(row) : null;
  }

  // All pages, home first, then in navigation order.
  list(): Page[] {
    return this.db
      .query<PageRow, []>(
        `SELECT slug, title, description, in_nav, blocks, updated_at FROM pages
         ORDER BY slug != 'home', position, title`,
      )
      .all()
      .map(toPage);
  }

  nav(): NavItem[] {
    return this.list()
      .filter((page) => page.slug !== HOME && page.inNav)
      .map(({ slug, title }) => ({ slug, title }));
  }

  // Creates a page from a title and returns it. The address is derived from the title.
  create(title: string): Page {
    const cleanTitle = parseTitle(title);
    const base = slugify(cleanTitle);
    let slug = base;
    for (let n = 2; RESERVED_SLUGS.has(slug) || this.get(slug); n++) slug = `${base}-${n}`;

    const { next } = this.db.query<{ next: number }, []>("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM pages").get()!;
    this.insert(slug, { title: cleanTitle, blocks: [{ id: crypto.randomUUID(), type: "heading", text: cleanTitle }] }, next);
    return this.get(slug)!;
  }

  save(slug: string, changes: { title?: string; description?: string; inNav?: boolean; blocks?: Block[] }): Page {
    const page = this.get(slug);
    if (!page) throw new ValidationError("Seite nicht gefunden");
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const next = { ...page, ...defined };
    this.db
      .query("UPDATE pages SET title = ?, description = ?, in_nav = ?, blocks = ?, updated_at = ? WHERE slug = ?")
      .run(next.title, next.description, next.inNav ? 1 : 0, JSON.stringify(next.blocks), new Date().toISOString(), slug);
    return this.get(slug)!;
  }

  delete(slug: string) {
    if (slug === HOME) throw new ValidationError("Die Startseite kann nicht gelöscht werden");
    this.db.query("DELETE FROM pages WHERE slug = ?").run(slug);
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

  private insert(slug: string, page: { title: string; blocks: Block[] }, position: number) {
    this.db
      .query("INSERT INTO pages (slug, title, description, in_nav, position, blocks, updated_at) VALUES (?, ?, '', 1, ?, ?, ?)")
      .run(slug, page.title, position, JSON.stringify(page.blocks), new Date().toISOString());
  }
}

export class SettingsStore {
  constructor(private db: Database) {}

  site(): SiteSettings {
    const row = this.db.query<{ value: string }, []>("SELECT value FROM settings WHERE key = 'site'").get();
    return { ...defaultSite, ...(row ? (JSON.parse(row.value) as Partial<SiteSettings>) : {}) };
  }

  saveSite(input: { name: unknown; description: unknown }): SiteSettings {
    const site = {
      name: text(input.name, "Name", 1, 100),
      description: text(input.description, "Beschreibung", 0, 300),
    };
    this.db
      .query("INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(site));
    return site;
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

function toPage(row: PageRow): Page {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    inNav: row.in_nav === 1,
    blocks: parseBlocks(JSON.parse(row.blocks)),
    updatedAt: row.updated_at,
  };
}

const defaultSite: SiteSettings = { name: "Meine Website", description: "" };

const homePage: { title: string; blocks: Block[] } = {
  title: "Willkommen bei Theta",
  blocks: [
    { id: "welcome-heading", type: "heading", text: "Willkommen bei Theta" },
    {
      id: "welcome-text",
      type: "text",
      text:
        "Das ist deine erste Seite. Öffne /edit, klick auf diesen Text und schreib einfach los.\n\n" +
        "Farben, Schriften und Abstände kommen aus dem Theme. Du kümmerst dich nur um den Inhalt, und die Seite sieht trotzdem immer stimmig aus.",
    },
    { id: "welcome-image", type: "image", src: "/media/theta.svg", alt: "Das griechische Zeichen Theta" },
  ],
};
