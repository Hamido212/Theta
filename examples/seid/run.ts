import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { AuthStore } from "../../src/auth";
import { ContactStore } from "../../src/contact";
import { openDatabase } from "../../src/db";
import { exportSite, writeFiles } from "../../src/export";
import { MediaStore } from "../../src/media";
import { createApp } from "../../src/server";
import { PageStore, SettingsStore } from "../../src/store";
import { seedSeid } from "./seed";

// This example always uses its own database and media, independent of THETA_DB.
const dataDir = join(import.meta.dir, "data");
mkdirSync(dataDir, { recursive: true });
const path = join(dataDir, "theta.db");
const existing = existsSync(path);
if (existing) {
  // Check before applying migrations: a misplaced database must remain untouched.
  const previous = new Database(path, { readonly: true });
  try {
    if (!previous.query("SELECT 1 FROM settings WHERE key = 'seid_demo'").get()) throw new Error("No demo marker");
  } catch {
    throw new Error("In diesem Demo-Ordner liegt bereits eine andere Website. Sie wird nicht überschrieben.");
  } finally { previous.close(); }
}
const db = openDatabase(path);
const stores = { db, pages: new PageStore(db), settings: new SettingsStore(db), media: new MediaStore(db, join(dataDir, "uploads")) };
if (!existing) await seedSeid(stores);

if (Bun.argv.includes("--export")) {
  const destination = join(import.meta.dir, "export");
  const files = await exportSite(stores, "https://seid.dev");
  await writeFiles(files, destination);
  db.close();
  console.log(`${files.size} Dateien nach ${destination} exportiert.`);
} else {
  const auth = new AuthStore(db);
  const setupToken = auth.hasUsers() ? undefined : Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.THETA_DEMO_PORT ?? 3108), fetch: createApp({ ...stores, auth, setupToken, contact: new ContactStore(db) }).fetch });
  console.log(`seid.dev in Theta: ${server.url}`);
  console.log(`Bearbeiten: ${new URL("/edit", server.url)}`);
  if (setupToken) console.log(`Eigenes Konto einrichten: ${new URL(`/setup?token=${setupToken}`, server.url)}`);
}
