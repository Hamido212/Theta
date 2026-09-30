import { dirname, join } from "node:path";
import { AuthError, AuthStore } from "./auth";
import { openDatabase } from "./db";
import { exportSite, writeFiles } from "./export";
import { MediaStore } from "./media";
import { PageStore, SettingsStore } from "./store";

// Maintenance commands, e.g.: bun run theta reset-password you@example.com

const [command, arg, extra] = Bun.argv.slice(2);

if (command === "reset-password" && arg) {
  const email = arg;
  const auth = new AuthStore(openDatabase(process.env.THETA_DB ?? "theta.db"));
  const password = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url");
  try {
    await auth.setPassword(email, password);
    console.log(`Neues Passwort für ${email}: ${password}`);
    console.log("Alle bestehenden Anmeldungen dieses Kontos wurden beendet.");
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
} else if (command === "export" && arg) {
  const [dir, url] = [arg, extra ?? process.env.THETA_URL];
  if (!url) {
    console.error("Bitte die Adresse der Website angeben: bun run theta export <Ordner> https://meine-seite.de");
    process.exit(1);
  }
  const dbPath = process.env.THETA_DB ?? "theta.db";
  const db = openDatabase(dbPath);
  const stores = {
    pages: new PageStore(db),
    settings: new SettingsStore(db),
    media: new MediaStore(db, process.env.THETA_UPLOADS ?? join(dirname(dbPath), "uploads")),
  };
  const files = await exportSite(stores, new URL(url).origin);
  await writeFiles(files, dir);
  console.log(`${files.size} Dateien nach ${dir} exportiert.`);
} else {
  console.log("Verwendung:");
  console.log("  bun run theta reset-password <E-Mail>");
  console.log("  bun run theta export <Ordner> <Adresse der Website>");
  process.exit(command ? 1 : 0);
}
