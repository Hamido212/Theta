import { dirname, join } from "node:path";
import { AuthError, AuthStore } from "./auth";
import { BackupError, Backups, backupName } from "./backup";
import { openDatabase } from "./db";
import { exportSite, writeFiles } from "./export";
import { MediaStore } from "./media";
import { PageStore, SettingsStore, slugify } from "./store";

// Maintenance commands, shared by `bun run theta …` (src/cli.ts) and the program (src/desktop.ts).
// `program` is how the user calls them, e.g. "bun run theta" or "./theta".

export const commands = ["reset-password", "export", "backup", "restore", "hilfe", "help", "--help", "-h"];

export async function runCommand(args: string[], program: string): Promise<number> {
  const [command, arg, extra] = args;

  if (command === "reset-password" && arg) {
    const email = arg;
    const auth = new AuthStore(openDatabase(dbPath()));
    const password = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url");
    try {
      await auth.setPassword(email, password);
      console.log(`Neues Passwort für ${email}: ${password}`);
      console.log("Alle bestehenden Anmeldungen dieses Kontos wurden beendet.");
      return 0;
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      console.error(err.message);
      return 1;
    }
  }

  if (command === "export" && arg) {
    const [dir, url] = [arg, extra ?? process.env.THETA_URL];
    if (!url) {
      console.error(`Bitte die Adresse der Website angeben: ${program} export <Ordner> https://meine-seite.de`);
      return 1;
    }
    const db = openDatabase(dbPath());
    const stores = {
      pages: new PageStore(db),
      settings: new SettingsStore(db),
      media: new MediaStore(db, uploadsPath()),
    };
    const files = await exportSite(stores, new URL(url).origin);
    await writeFiles(files, dir);
    console.log(`${files.size} Dateien nach ${dir} exportiert.`);
    return 0;
  }

  if (command === "backup") {
    const { backups, settings } = open();
    const file = arg ?? backupName(slugify(settings.site().name));
    await Bun.write(file, backups.create());
    console.log(`Sicherung gespeichert: ${file}`);
    return 0;
  }

  if (command === "restore" && arg) {
    if (extra !== "--ja") {
      console.error("Das Einspielen ersetzt die ganze Website. Beende zuerst Theta und bestätige mit:");
      console.error(`  ${program} restore ${arg} --ja`);
      return 1;
    }
    const { backups } = open();
    try {
      const result = backups.restore(await Bun.file(arg).bytes());
      console.log(`Sicherung eingespielt: ${result.pages} Seiten und Abschnitte, ${result.media} Bilder.`);
      if (result.safetyCopy) console.log(`Der vorherige Stand liegt in ${result.safetyCopy}.`);
      return 0;
    } catch (err) {
      if (!(err instanceof BackupError)) throw err;
      console.error(err.message);
      return 1;
    }
  }

  console.log("Verwendung:");
  console.log(`  ${program} reset-password <E-Mail>`);
  console.log(`  ${program} export <Ordner> <Adresse der Website>`);
  console.log(`  ${program} backup [Datei.zip]`);
  console.log(`  ${program} restore <Datei.zip> --ja`);
  return !command || ["hilfe", "help", "--help", "-h"].includes(command) ? 0 : 1;
}

// The same files the server uses (src/server.ts).
function dbPath() {
  return process.env.THETA_DB ?? "theta.db";
}

function uploadsPath() {
  return process.env.THETA_UPLOADS ?? join(dirname(dbPath()), "uploads");
}

// The site's database with its uploads folder and backups, as the server opens them.
function open() {
  const db = openDatabase(dbPath());
  return { db, settings: new SettingsStore(db), backups: new Backups(db, uploadsPath(), join(dirname(dbPath()), "sicherungen")) };
}
