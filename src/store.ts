import { Database } from "bun:sqlite";
import { type Block, type Page, parseBlocks } from "./blocks";

// The whole site lives in one SQLite file: copy the file and you have moved the site.

type PageRow = { slug: string; title: string; blocks: string; updated_at: string };

export class PageStore {
  private db: Database;

  constructor(path: string = "theta.db") {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS pages (
        slug       TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        blocks     TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    if (!this.get("home")) this.save("home", homePage);
  }

  get(slug: string): Page | null {
    const row = this.db
      .query<PageRow, [string]>("SELECT slug, title, blocks, updated_at FROM pages WHERE slug = ?")
      .get(slug);
    if (!row) return null;
    return {
      slug: row.slug,
      title: row.title,
      blocks: parseBlocks(JSON.parse(row.blocks)),
      updatedAt: row.updated_at,
    };
  }

  save(slug: string, page: { title: string; blocks: Block[] }): Page {
    const updatedAt = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO pages (slug, title, blocks, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET title = excluded.title, blocks = excluded.blocks, updated_at = excluded.updated_at`,
      )
      .run(slug, page.title, JSON.stringify(page.blocks), updatedAt);
    return { slug, title: page.title, blocks: page.blocks, updatedAt };
  }

  close() {
    this.db.close();
  }
}

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
