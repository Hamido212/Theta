import type { Database } from "bun:sqlite";
import { ValidationError } from "./blocks";

// Old addresses that lead to new ones, so links and search results keep working when a
// page gets a new address or a site moves to Theta from somewhere else.

export type Redirect = {
  // Path on this site, e.g. /ueber-uns or /2019/05/mein-beitrag.html.
  from: string;
  // A path on this site or a full web address.
  to: string;
  // "rename" when Theta added it because a page got a new address.
  reason: "rename" | "manual";
  createdAt: string;
};

// Addresses Theta itself needs; they can never be redirected.
const RESERVED = new Set(["admin", "api", "assets", "edit", "login", "logout", "media", "setup", "sitemap.xml", "robots.txt"]);

const MAX_REDIRECTS = 1_000;

type Row = { from_path: string; to_path: string; reason: Redirect["reason"]; created_at: string };

const toRedirect = (row: Row): Redirect => ({ from: row.from_path, to: row.to_path, reason: row.reason, createdAt: row.created_at });

// The same address with or without a slash at the end.
export const normalizePath = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") || "/" : path);

export class RedirectStore {
  constructor(private db: Database) {}

  list(): Redirect[] {
    return this.db.query<Row, []>("SELECT * FROM redirects ORDER BY created_at DESC, from_path").all().map(toRedirect);
  }

  // Where an address that has no page of its own leads, if anywhere.
  find(path: string): string | null {
    const row = this.db.query<{ to_path: string }, [string]>("SELECT to_path FROM redirects WHERE from_path = ?").get(normalizePath(path));
    return row?.to_path ?? null;
  }

  // Adds or replaces a redirect typed in by the site owner. `taken` tells whether a page lives at a path.
  add(input: { from: unknown; to: unknown }, taken: (path: string) => boolean): Redirect {
    const from = parseFrom(input.from);
    if (taken(from)) throw new ValidationError(`Unter ${from} gibt es schon eine Seite. Ändere stattdessen die Adresse der Seite.`);
    const to = parseTo(input.to);
    if (normalizePath(to) === from) throw new ValidationError("Eine Adresse kann nicht auf sich selbst weiterleiten");
    if (this.leadsTo(to, from)) throw new ValidationError(`${to} leitet schon auf ${from} weiter. Das ergäbe eine Schleife.`);
    if (!this.find(from) && this.count() >= MAX_REDIRECTS) throw new ValidationError(`Höchstens ${MAX_REDIRECTS} Weiterleitungen`);
    this.save(from, to, "manual");
    return toRedirect(this.db.query<Row, [string]>("SELECT * FROM redirects WHERE from_path = ?").get(from)!);
  }

  remove(from: string) {
    this.db.query("DELETE FROM redirects WHERE from_path = ?").run(normalizePath(from));
  }

  // A page moved from one path to another: the old path leads to the new one, older redirects
  // to the old path skip the extra step, and nothing leads away from the new path any more.
  moved(from: string, to: string) {
    this.db.query("DELETE FROM redirects WHERE from_path = ?").run(to);
    this.db.query("UPDATE redirects SET to_path = ? WHERE to_path = ?").run(to, from);
    this.save(from, to, "rename");
  }

  // Whether following the redirects from `start` ends up at `path`.
  private leadsTo(start: string, path: string) {
    let next: string | null = start;
    for (let step = 0; next && step < 20; step++) {
      if (normalizePath(next) === path) return true;
      next = this.find(next);
    }
    return false;
  }

  private count() {
    return this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM redirects").get()!.n;
  }

  private save(from: string, to: string, reason: Redirect["reason"]) {
    this.db
      .query(
        `INSERT INTO redirects (from_path, to_path, reason, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(from_path) DO UPDATE SET to_path = excluded.to_path, reason = excluded.reason, created_at = excluded.created_at`,
      )
      .run(from, to, reason, new Date().toISOString());
  }
}

// The old address: a path, or a full address of the old site from which only the path counts.
function parseFrom(input: unknown): string {
  const value = String(input ?? "").trim();
  if (!value) throw new ValidationError("Bitte die alte Adresse angeben, z. B. /ueber-uns.html");
  const full = /^https?:\/\//i.test(value);
  if (!full && (!value.startsWith("/") || value.startsWith("//"))) throw new ValidationError("Die alte Adresse muss mit / beginnen, z. B. /ueber-uns.html");
  let path: string;
  try {
    // Only the path counts: query and anchor are dropped, "." and ".." resolved, special characters encoded.
    path = normalizePath(new URL(value, "http://theta.invalid").pathname);
  } catch {
    throw new ValidationError("Die alte Adresse ist ungültig");
  }
  if (path === "/") throw new ValidationError("Die Startseite kann nicht weitergeleitet werden");
  if (path.length > 500) throw new ValidationError("Die alte Adresse ist zu lang");
  if (RESERVED.has(path.split("/")[1]!.toLowerCase())) throw new ValidationError(`${path} wird von Theta selbst gebraucht`);
  return path;
}

// The new address: a path on this site or a full web address.
function parseTo(input: unknown): string {
  const value = String(input ?? "").trim();
  if (!value) throw new ValidationError("Bitte das Ziel angeben, z. B. /kontakt");
  if (value.length > 1_000) throw new ValidationError("Das Ziel ist zu lang");
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).href;
    } catch {
      throw new ValidationError("Das Ziel ist keine gültige Adresse");
    }
  }
  if (!value.startsWith("/") || value.startsWith("//") || /[\s\\]/.test(value)) {
    throw new ValidationError("Das Ziel muss mit / beginnen (eine Seite dieser Website) oder eine Adresse mit https:// sein");
  }
  return value;
}
