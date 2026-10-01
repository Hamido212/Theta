import { Database } from "bun:sqlite";

// Content lives in SQLite; a complete backup also includes the uploads directory.

// Each entry upgrades the schema by one version. Never edit an entry that has shipped;
// append a new one instead. PRAGMA user_version records how many have run.
export const migrations: string[] = [
  `CREATE TABLE IF NOT EXISTS pages (
     slug       TEXT PRIMARY KEY,
     title      TEXT NOT NULL,
     blocks     TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE users (
     id            INTEGER PRIMARY KEY,
     email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
     name          TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     created_at    TEXT NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at TEXT NOT NULL
   )`,
  `ALTER TABLE pages ADD COLUMN description TEXT NOT NULL DEFAULT '';
   ALTER TABLE pages ADD COLUMN in_nav INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE pages ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE media (
     id         TEXT PRIMARY KEY,
     filename   TEXT NOT NULL,
     file       TEXT NOT NULL,
     width      INTEGER NOT NULL,
     height     INTEGER NOT NULL,
     size       INTEGER NOT NULL,
     variants   TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE revisions (
     id          INTEGER PRIMARY KEY,
     slug        TEXT NOT NULL,
     title       TEXT NOT NULL,
     description TEXT NOT NULL,
     in_nav      INTEGER NOT NULL,
     blocks      TEXT NOT NULL,
     author      TEXT NOT NULL,
     created_at  TEXT NOT NULL
   );
   CREATE INDEX revisions_by_page ON revisions (slug, id)`,
  `ALTER TABLE pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'page';
   ALTER TABLE pages ADD COLUMN published_at TEXT`,
  `ALTER TABLE pages ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE pages ADD COLUMN live_data TEXT;
   ALTER TABLE pages ADD COLUMN deleted_at TEXT;
   ALTER TABLE revisions ADD COLUMN autosave INTEGER NOT NULL DEFAULT 0;
   UPDATE pages SET published_at = updated_at WHERE kind = 'page';
   UPDATE pages SET live_data = json_object('title', title, 'description', description,
     'inNav', json(CASE WHEN in_nav = 1 THEN 'true' ELSE 'false' END),
     'blocks', json(blocks), 'updatedAt', updated_at) WHERE published_at IS NOT NULL;
   CREATE TABLE section_templates (
     id TEXT PRIMARY KEY, title TEXT NOT NULL, blocks TEXT NOT NULL, created_at TEXT NOT NULL
   )`,
  `CREATE TABLE messages (
     id         INTEGER PRIMARY KEY,
     page       TEXT NOT NULL,
     page_title TEXT NOT NULL,
     name       TEXT NOT NULL,
     email      TEXT NOT NULL,
     phone      TEXT NOT NULL,
     message    TEXT NOT NULL,
     created_at TEXT NOT NULL,
     read_at    TEXT,
     mail       TEXT NOT NULL
   )`,
  `CREATE TABLE redirects (
     from_path  TEXT PRIMARY KEY,
     to_path    TEXT NOT NULL,
     reason     TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
];

export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  const { user_version: version } = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!;
  db.transaction(() => {
    migrations.slice(version).forEach((sql) => db.run(sql));
    db.run(`PRAGMA user_version = ${migrations.length}`);
  })();
  return db;
}
