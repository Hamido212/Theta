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
  isSafeImageSrc,
  parseBlocks,
} from "./blocks";
import { type ThemeSettings, defaultTheme, parseTheme } from "./theme/tokens";
import { type SavedSectionTemplate, type PageTemplateId, pageBlocks } from "./templates";

type PageRow = {
  slug: string;
  kind: string;
  title: string;
  description: string;
  in_nav: number;
  blocks: string;
  updated_at: string;
  published_at: string | null;
  version: number;
  live_data: string | null;
  deleted_at: string | null;
};

const PAGE_COLUMNS = "slug, kind, title, description, in_nav, blocks, updated_at, published_at, version, live_data, deleted_at";

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
    if (!this.get(HOME)) {
      this.insert(HOME, homePage, 0);
      this.publish(HOME, true);
    }
  }

  get(slug: string): Page | null {
    const row = this.db.query<PageRow, [string]>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE slug = ? AND deleted_at IS NULL`).get(slug);
    return row ? toPage(row) : null;
  }

  // A published post, or null for drafts and pages.
  post(slug: string): Page | null {
    const page = this.live(slug);
    return page?.kind === "post" && page.publishedAt ? page : null;
  }

  // All pages (not posts), home first, then in navigation order.
  list(): Page[] {
    return this.db
      .query<PageRow, []>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE kind = 'page' AND deleted_at IS NULL ORDER BY slug != 'home', position, title`)
      .all()
      .map(toPage);
  }

  // Blog posts, newest first. Drafts come first when they are included.
  posts({ drafts = false } = {}): Page[] {
    return this.db
      .query<PageRow, []>(
        `SELECT ${PAGE_COLUMNS} FROM pages WHERE kind = 'post' AND deleted_at IS NULL ${drafts ? "" : "AND published_at IS NOT NULL"}
         ORDER BY published_at IS NOT NULL, published_at DESC, updated_at DESC`,
      )
      .all()
      .map((row) => drafts ? toPage(row) : toLive(row)!).filter(Boolean);
  }

  live(slug: string): Page | null {
    const row = this.db.query<PageRow, [string]>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE slug = ? AND deleted_at IS NULL`).get(slug);
    return row ? toLive(row) : null;
  }

  publishedPages(): Page[] {
    return this.db.query<PageRow, []>(`SELECT ${PAGE_COLUMNS} FROM pages
      WHERE kind = 'page' AND deleted_at IS NULL AND live_data IS NOT NULL
      ORDER BY slug != 'home', position, json_extract(live_data, '$.title')`).all()
      .flatMap((row) => toLive(row) ?? []);
  }

  // Keep images referenced by drafts, live snapshots, history and trash recoverable.
  all(): Page[] {
    const rows = this.db.query<PageRow, []>(`SELECT ${PAGE_COLUMNS} FROM pages`).all();
    return rows.flatMap((row) => {
      const page = toPage(row);
      return [page, ...(toLive(row) ? [toLive(row)!] : []),
        ...this.revisions(row.slug).map((r) => ({ ...page, ...this.revision(row.slug, r.id)! }))];
    });
  }

  trash(): Page[] {
    return this.db.query<PageRow, []>(`SELECT ${PAGE_COLUMNS} FROM pages WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all().map(toPage);
  }

  // The main menu. Legal pages chosen for the footer are left out, they already appear there.
  nav(site?: Pick<SiteSettings, "imprint" | "privacy">): NavItem[] {
    const legal = [site?.imprint, site?.privacy];
    const items: NavItem[] = this.publishedPages()
      .filter((page) => page.slug !== HOME && page.inNav && !legal.includes(page.slug))
      .map(({ slug, title }) => ({ slug, title }));
    // The blog shows up in the menu as soon as there is something to read.
    const hasPosts = this.db.query("SELECT 1 FROM pages WHERE kind = 'post' AND published_at IS NOT NULL AND deleted_at IS NULL LIMIT 1").get();
    if (hasPosts) items.push({ slug: BLOG, title: "Blog", href: `/${BLOG}` });
    return items;
  }

  // Links for the footer: legal notice and privacy policy, if those pages still exist.
  legal(site: SiteSettings): NavItem[] {
    return [
      { slug: site.imprint, title: "Impressum" },
      { slug: site.privacy, title: "Datenschutz" },
    ].filter((item) => item.slug !== "" && this.live(item.slug)?.kind === "page")
      .map((item) => ({ ...item, title: site.language === "en" ? this.live(item.slug)!.title : item.title }));
  }

  // Creates a page or post from a title and returns it. The address is derived from the title.
  create(title: string, author = "", kind: PageKind = "page", template: PageTemplateId = "blank"): Page {
    const cleanTitle = parseTitle(title);
    const base = slugify(cleanTitle);
    let slug = base;
    for (let n = 2; RESERVED_SLUGS.has(slug) || this.db.query("SELECT 1 FROM pages WHERE slug = ?").get(slug); n++) slug = `${base}-${n}`;

    const { next } = this.db.query<{ next: number }, []>("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM pages").get()!;
    const blocks = pageBlocks(template, cleanTitle);
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
    options: { version?: number; autosave?: boolean; action?: "save" | "publish" | "unpublish" } = {},
  ): Page {
    return this.db.transaction(() => {
      const page = this.get(slug);
      if (!page) throw new ValidationError("Seite nicht gefunden");
      checkVersion(page, options.version);
      const { published, ...rest } = changes;
      const defined = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
      const next = { ...page, ...defined };
      const changed = contentKey(page) !== contentKey(next);
      if (changed) {
        this.db.query("UPDATE pages SET title = ?, description = ?, in_nav = ?, blocks = ?, updated_at = ?, version = version + 1 WHERE slug = ?")
          .run(next.title, next.description, next.inNav ? 1 : 0, JSON.stringify(next.blocks), new Date().toISOString(), slug);
        this.recordRevision(this.get(slug)!, author, options.autosave === true);
      }
      const action = options.action ?? (published === undefined ? "save" : published ? "publish" : "unpublish");
      if (action !== "save") return this.publish(slug, action === "publish");
      return this.get(slug)!;
    })();
  }

  publish(slug: string, published: boolean, version?: number): Page {
    return this.db.transaction(() => {
      const page = this.get(slug);
      if (!page) throw new ValidationError("Seite nicht gefunden");
      checkVersion(page, version);
      if (slug === HOME && !published) throw new ValidationError("Die Startseite bleibt veröffentlicht. Veröffentliche stattdessen eine neue Fassung.");
      const now = new Date().toISOString();
      const data = published ? JSON.stringify({ ...contentData(page), updatedAt: now }) : null;
      this.db.query("UPDATE pages SET live_data = ?, published_at = ?, version = version + 1 WHERE slug = ?")
        .run(data, published ? (page.publishedAt ?? now) : null, slug);
      // A publication is a history boundary: the next autosave must not replace it.
      this.db.query("UPDATE revisions SET autosave = 0 WHERE slug = ?").run(slug);
      return this.get(slug)!;
    })();
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

  private recordRevision(page: Page, author: string, autosave = false) {
    const last = this.db.query<{ id: number; autosave: number; author: string; created_at: string }, [string]>("SELECT id, autosave, author, created_at FROM revisions WHERE slug = ? ORDER BY id DESC LIMIT 1").get(page.slug);
    // One checkpoint per five-minute typing session, bounded by manual saves/publication.
    if (autosave && last?.autosave && last.author === author && Date.now() - Date.parse(last.created_at) < 300_000) {
      this.db.query("UPDATE revisions SET title = ?, description = ?, in_nav = ?, blocks = ? WHERE id = ?")
        .run(page.title, page.description, page.inNav ? 1 : 0, JSON.stringify(page.blocks), last.id);
      return;
    }
    this.db
      .query("INSERT INTO revisions (slug, title, description, in_nav, blocks, author, created_at, autosave) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(page.slug, page.title, page.description, page.inNav ? 1 : 0, JSON.stringify(page.blocks), author, page.updatedAt, autosave ? 1 : 0);
    this.db
      .query(
        `DELETE FROM revisions WHERE slug = ? AND id NOT IN
           (SELECT id FROM revisions WHERE slug = ? ORDER BY id DESC LIMIT ${MAX_REVISIONS})`,
      )
      .run(page.slug, page.slug);
  }

  delete(slug: string, version?: number) {
    if (slug === HOME) throw new ValidationError("Die Startseite kann nicht gelöscht werden");
    const page = this.get(slug);
    if (!page) throw new ValidationError("Seite nicht gefunden");
    checkVersion(page, version);
    this.db.query("UPDATE pages SET deleted_at = ?, version = version + 1 WHERE slug = ?")
      .run(new Date().toISOString(), slug);
  }

  restore(slug: string, version?: number): Page {
    const page = this.trash().find((page) => page.slug === slug);
    if (!page) throw new ValidationError("Seite nicht im Papierkorb gefunden");
    checkVersion(page, version);
    this.db.query("UPDATE pages SET deleted_at = NULL, live_data = NULL, published_at = NULL, version = version + 1 WHERE slug = ?").run(slug);
    return this.get(slug)!;
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

  templates(): SavedSectionTemplate[] {
    return this.db.query<{ id: string; title: string; blocks: string }, []>("SELECT id, title, blocks FROM section_templates ORDER BY created_at DESC, id").all()
      .map((row) => ({ ...row, blocks: parseBlocks(JSON.parse(row.blocks)) }));
  }

  saveTemplate(title: unknown, input: unknown): SavedSectionTemplate {
    const blocks = parseBlocks(input);
    if (blocks.length < 2 || blocks[0]?.type !== "section" || blocks.slice(1).some((b) => b.type === "section")) throw new ValidationError("Bitte einen Abschnitt mit Inhalt auswählen.");
    if (this.templates().length >= 100) throw new ValidationError("Höchstens 100 eigene Vorlagen. Lösche zuerst eine nicht mehr benötigte Vorlage.");
    const template = { id: crypto.randomUUID(), title: parseTitle(title), blocks };
    this.db.query("INSERT INTO section_templates (id, title, blocks, created_at) VALUES (?, ?, ?, ?)")
      .run(template.id, template.title, JSON.stringify(blocks), new Date().toISOString());
    return template;
  }

  deleteTemplate(id: string) { this.db.query("DELETE FROM section_templates WHERE id = ?").run(id); }

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

  saveSite(input: Partial<Record<keyof SiteSettings, unknown>>): SiteSettings {
    const current = this.site();
    const page = (value: unknown, field: string) => {
      const slug = value === undefined ? "" : String(value);
      if (slug !== "" && !this.db.query("SELECT 1 FROM pages WHERE slug = ? AND kind = 'page' AND deleted_at IS NULL").get(slug)) {
        throw new ValidationError(`Die Seite für ${field} gibt es nicht`);
      }
      return slug;
    };
    const logo = input.logo === undefined ? current.logo : String(input.logo).trim();
    if (logo !== "" && !isSafeImageSrc(logo)) throw new ValidationError("Das Logo muss ein Bild aus der Mediathek sein");
    const language = input.language ?? current.language ?? "de";
    if (language !== "de" && language !== "en") throw new ValidationError("Die Website-Sprache muss Deutsch oder Englisch sein");
    const site: SiteSettings = {
      name: text(input.name, "Name", 1, 100),
      description: text(input.description ?? "", "Beschreibung", 0, 300),
      language,
      logo,
      // Line breaks matter in the footer (e.g. an address), so it is not squeezed like the fields above.
      footer: input.footer === undefined ? current.footer : footerText(input.footer),
      imprint: input.imprint === undefined ? current.imprint : page(input.imprint, "das Impressum"),
      privacy: input.privacy === undefined ? current.privacy : page(input.privacy, "den Datenschutz"),
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

export class ConflictError extends Error {
  constructor() { super("Diese Seite wurde inzwischen geändert. Lade den Serverstand, bevor du weiter speicherst. Dein Text bleibt hier erhalten."); }
}

export function parseVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new ValidationError("Bitte die Seite neu laden: Die Versionsnummer fehlt oder ist ungültig.");
  return value;
}

function checkVersion(page: Page, version?: number) {
  if (version !== undefined && page.version !== version) throw new ConflictError();
}

type ContentData = Pick<Page, "title" | "description" | "inNav" | "blocks">;
const contentData = (page: ContentData): ContentData => ({ title: page.title, description: page.description, inNav: page.inNav, blocks: page.blocks });
const contentKey = (page: ContentData) => JSON.stringify(contentData({ ...page, blocks: parseBlocks(page.blocks) }));

function toLive(row: PageRow): Page | null {
  if (!row.live_data || !row.published_at) return null;
  const live = JSON.parse(row.live_data);
  return { ...toPage(row), ...live, blocks: parseBlocks(live.blocks), hasChanges: false };
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
    version: row.version,
    deletedAt: row.deleted_at,
    hasChanges: !row.live_data || contentKey({ title: row.title, description: row.description, inNav: row.in_nav === 1, blocks: parseBlocks(JSON.parse(row.blocks)) }) !== contentKey(JSON.parse(row.live_data)),
  };
}

const defaultSite: SiteSettings = { name: "Meine Website", description: "", logo: "", footer: "", imprint: "", privacy: "" };

function footerText(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("Die Fußzeile muss Text sein");
  const clean = value.replace(/\r\n?/g, "\n").trim();
  if (clean.length > 2_000) throw new ValidationError("Die Fußzeile darf höchstens 2000 Zeichen lang sein");
  return clean;
}

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
