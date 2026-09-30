import { Database } from "bun:sqlite";

// The whole site lives in one SQLite file: copy the file and you have moved the site.

// Each entry upgrades the schema by one version. Never edit an entry that has shipped;
// append a new one instead. PRAGMA user_version records how many have run.
const migrations: string[] = [
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
