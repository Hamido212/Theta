import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { unzipSync } from "fflate";
import { migrations, openDatabase } from "./db";
import { zip } from "./zip";

// A backup is a ZIP with a consistent copy of the database, every uploaded file and a
// small manifest. Unlike the static export it can bring a whole Theta site back: drafts,
// history, trash, accounts, messages and settings. Sessions are left out, so restoring
// signs everybody out.

const MANIFEST = "theta-backup.json";
const DATABASE = "theta.db";
const UPLOADS = "uploads/";
const FORMAT = 1;

export const MAX_BACKUP_BYTES = 1024 ** 3;

export class BackupError extends Error {}

type Manifest = { format: number; schema: number; createdAt: string; site: string };

export class Backups {
  constructor(
    private db: Database,
    private uploads: string,
    // Where a copy of the current site is kept before a restore replaces it.
    private safetyDir?: string,
  ) {}

  create(date = new Date()): Uint8Array<ArrayBuffer> {
    const dir = mkdtempSync(join(tmpdir(), "theta-backup-"));
    try {
      // VACUUM INTO writes a consistent snapshot even while the site is in use.
      const file = join(dir, DATABASE);
      this.db.query("VACUUM INTO ?").run(file);
      const snapshot = new Database(file, { strict: true });
      snapshot.run("DELETE FROM sessions");
      const site = snapshot.query<{ value: string }, []>("SELECT value FROM settings WHERE key = 'site'").get();
      snapshot.close();

      const manifest: Manifest = {
        format: FORMAT,
        schema: migrations.length,
        createdAt: date.toISOString(),
        site: site ? String((JSON.parse(site.value) as { name?: unknown }).name ?? "") : "",
      };
      const files = new Map<string, Uint8Array>([
        [MANIFEST, new TextEncoder().encode(JSON.stringify(manifest, null, 2))],
        [DATABASE, readFileSync(file)],
      ]);
      for (const path of listFiles(this.uploads)) {
        files.set(UPLOADS + relative(this.uploads, path).split(sep).join("/"), readFileSync(path));
      }
      return zip(files, date);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Replaces everything on this site with the backup. Returns where the previous state was
  // kept, if a safety directory is configured.
  restore(archive: Uint8Array): { safetyCopy?: string; pages: number; media: number } {
    const { manifest, database, uploads } = readArchive(archive);

    const dir = mkdtempSync(join(tmpdir(), "theta-restore-"));
    const staging = `${this.uploads}.restore-${Date.now()}`;
    try {
      const file = join(dir, DATABASE);
      writeFileSync(file, database);
      checkDatabase(file, manifest);
      // Brings an older backup up to the current schema, so its tables match this version.
      openDatabase(file).close();

      for (const [path, data] of uploads) {
        const target = join(staging, ...path.split("/"));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, data);
      }

      let safetyCopy: string | undefined;
      if (this.safetyDir) {
        mkdirSync(this.safetyDir, { recursive: true });
        safetyCopy = join(this.safetyDir, `vor-wiederherstellung-${stamp(new Date())}.zip`);
        writeFileSync(safetyCopy, this.create());
      }

      // The new uploads take the old folder's place. If the database cannot be replaced,
      // the old folder comes back, so the site is never half restored.
      mkdirSync(staging, { recursive: true });
      const previous = existsSync(this.uploads) ? `${this.uploads}.old-${Date.now()}` : undefined;
      if (previous) renameSync(this.uploads, previous);
      renameSync(staging, this.uploads);
      let counts: { pages: number; media: number };
      try {
        counts = this.copyTables(file);
      } catch (err) {
        rmSync(this.uploads, { recursive: true, force: true });
        if (previous) renameSync(previous, this.uploads);
        else mkdirSync(this.uploads, { recursive: true });
        throw err;
      }
      if (previous) rmSync(previous, { recursive: true, force: true });
      return { safetyCopy, ...counts };
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(staging, { recursive: true, force: true });
    }
  }

  private copyTables(file: string) {
    const tables = this.db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name);
    this.db.query("ATTACH DATABASE ? AS backup").run(file);
    this.db.run("PRAGMA foreign_keys = OFF");
    try {
      this.db.transaction(() => {
        for (const table of tables) {
          const columns = this.db
            .query<{ name: string }, []>(`SELECT name FROM pragma_table_info('${table}', 'main')`)
            .all()
            .map((column) => `"${column.name}"`)
            .join(", ");
          this.db.run(`DELETE FROM main."${table}"`);
          if (table !== "sessions") this.db.run(`INSERT INTO main."${table}" (${columns}) SELECT ${columns} FROM backup."${table}"`);
        }
      })();
      const count = (table: string) => this.db.query<{ n: number }, []>(`SELECT count(*) AS n FROM main."${table}"`).get()!.n;
      return { pages: count("pages"), media: count("media") };
    } finally {
      this.db.run("PRAGMA foreign_keys = ON");
      this.db.run("DETACH DATABASE backup");
    }
  }
}

function readArchive(archive: Uint8Array) {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archive);
  } catch {
    throw new BackupError("Diese Datei ist keine lesbare ZIP-Datei.");
  }
  const raw = entries[MANIFEST];
  const database = entries[DATABASE];
  if (!raw || !database) throw new BackupError("Diese ZIP-Datei ist keine Theta-Sicherung. Der HTML-Export lässt sich nicht einspielen.");

  let manifest: Manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(raw)) as Manifest;
  } catch {
    throw new BackupError("Die Beschreibung der Sicherung ist beschädigt.");
  }
  if (manifest.format !== FORMAT || typeof manifest.schema !== "number") throw new BackupError("Dieses Sicherungsformat kennt Theta nicht.");
  if (manifest.schema > migrations.length) {
    throw new BackupError("Diese Sicherung stammt aus einer neueren Theta-Version. Bitte aktualisiere Theta zuerst.");
  }

  const uploads = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (name === MANIFEST || name === DATABASE || name.endsWith("/")) continue;
    const path = name.startsWith(UPLOADS) ? name.slice(UPLOADS.length) : "";
    // Only plain relative paths inside uploads/, so a crafted archive cannot write elsewhere.
    if (!path || path.split("/").some((part) => part === "" || part === "." || part === ".." || part.includes("\\") || part.includes(":"))) {
      throw new BackupError(`Unerwartete Datei in der Sicherung: ${name}`);
    }
    uploads.set(path, data);
  }
  return { manifest, database, uploads };
}

function checkDatabase(file: string, manifest: Manifest) {
  let db: Database | undefined;
  try {
    db = new Database(file, { readonly: true, strict: true });
    const ok = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()?.integrity_check === "ok";
    const { user_version } = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!;
    const hasPages = db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pages'").get() !== null;
    if (!ok || !hasPages || user_version > migrations.length || user_version !== manifest.schema) throw new Error();
  } catch {
    throw new BackupError("Die Datenbank in der Sicherung ist beschädigt.");
  } finally {
    db?.close();
  }
}

function listFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const stamp = (date: Date) => date.toISOString().slice(0, 19).replace(/[:T]/g, "-");

export const backupName = (site: string, date = new Date()) =>
  `${site}-sicherung-${date.toISOString().slice(0, 10)}.zip`;
