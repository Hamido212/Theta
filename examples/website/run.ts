import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { AuthStore } from "../../src/auth";
import { Backups } from "../../src/backup";
import { ContactStore } from "../../src/contact";
import { openDatabase } from "../../src/db";
import { exportSite, writeFiles } from "../../src/export";
import { MediaStore } from "../../src/media";
import { createApp } from "../../src/server";
import { PageStore, SettingsStore } from "../../src/store";
import { seedWebsite } from "./seed";

// Theta's own website, built with Theta. Like the seid.dev example it always uses its own
// database and media in examples/website/data, independent of THETA_DB.
const dataDir = join(import.meta.dir, "data");
mkdirSync(dataDir, { recursive: true });
const path = join(dataDir, "theta.db");
const existing = existsSync(path);
if (existing) {
  // Check before applying migrations: a misplaced database must remain untouched.
  const previous = new Database(path, { readonly: true });
  try {
    if (!previous.query("SELECT 1 FROM settings WHERE key = 'theta_website'").get()) throw new Error("No website marker");
  } catch {
    throw new Error("In diesem Ordner liegt bereits eine andere Website. Sie wird nicht überschrieben.");
  } finally { previous.close(); }
}
const db = openDatabase(path);
const uploads = join(dataDir, "uploads");
const stores = { db, pages: new PageStore(db), settings: new SettingsStore(db), media: new MediaStore(db, uploads) };
if (!existing) await seedWebsite(stores);

const exportIndex = Bun.argv.indexOf("--export");
if (exportIndex >= 0) {
  // The address the exported site will live at, for canonical links and the sitemap.
  const url = Bun.argv[exportIndex + 1] ?? process.env.THETA_URL ?? "http://localhost:8080";
  const destination = join(import.meta.dir, "export");
  const files = await exportSite(stores, new URL(url).origin);
  await writeFiles(files, destination);
  db.close();
  console.log(`${files.size} Dateien nach ${destination} exportiert (Adresse ${new URL(url).origin}).`);
} else {
  const auth = new AuthStore(db);
  const setupToken = auth.hasUsers() ? undefined : Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  const backups = new Backups(db, uploads, join(dataDir, "sicherungen"));
  const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.THETA_DEMO_PORT ?? 3109), fetch: createApp({ ...stores, auth, setupToken, contact: new ContactStore(db), backups }).fetch });
  console.log(`Theta-Website: ${server.url}`);
  console.log(`Bearbeiten: ${new URL("/edit", server.url)}`);
  if (setupToken) console.log(`Eigenes Konto einrichten: ${new URL(`/setup?token=${setupToken}`, server.url)}`);
}
