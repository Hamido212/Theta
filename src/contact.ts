import type { Database } from "bun:sqlite";
import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { ValidationError } from "./blocks";

// Messages from contact forms. Every message is stored in the admin inbox first, so nothing
// is lost when e-mail is not set up or the mail server is down. Sending a copy by e-mail is
// optional and needs the site owner's own mail server (SMTP).

export type Message = {
  id: number;
  // Page the form was on, for context in the inbox.
  page: string;
  pageTitle: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  // "none" without mail settings; otherwise "pending" until the e-mail copy was sent or failed.
  mail: "none" | "pending" | "sent" | "failed";
};

export type Submission = Pick<Message, "name" | "email" | "phone" | "message">;

export type MailSettings = {
  host: string;
  port: number;
  // "tls" connects encrypted (usually port 465), "starttls" upgrades a plain connection (usually 587).
  security: "tls" | "starttls";
  user: string;
  password: string;
  from: string;
  to: string;
};

// Sends one e-mail; replaced in tests.
export type Mailer = (settings: MailSettings, mail: { subject: string; text: string; replyTo?: string }) => Promise<void>;

export const smtpMailer: Mailer = async (settings, mail) => {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === "tls",
    requireTLS: settings.security === "starttls",
    auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  await transport.sendMail({ from: settings.from, to: settings.to, subject: mail.subject, text: mail.text, replyTo: mail.replyTo });
};

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;

// Visitors need some time to fill in a form; bots usually post at once. Forms older than a day
// are rejected so a stolen token cannot be reused forever.
const MIN_FILL_MS = 2_500;
const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;

type Row = {
  id: number;
  page: string;
  page_title: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
  read_at: string | null;
  mail: Message["mail"];
};

const toMessage = (row: Row): Message => ({
  id: row.id,
  page: row.page,
  pageTitle: row.page_title,
  name: row.name,
  email: row.email,
  phone: row.phone,
  message: row.message,
  createdAt: row.created_at,
  readAt: row.read_at,
  mail: row.mail,
});

export class ContactStore {
  private secret: string;

  constructor(
    private db: Database,
    private mailer: Mailer = smtpMailer,
  ) {
    const stored = this.setting("form-secret");
    this.secret = typeof stored === "string" ? stored : this.createSecret();
  }

  // A signed timestamp put into every form, checked when it comes back.
  token(now = Date.now()): string {
    return `${now}.${this.sign(String(now))}`;
  }

  checkToken(token: unknown, now = Date.now()): "ok" | "too-fast" | "invalid" {
    if (typeof token !== "string") return "invalid";
    const [time, signature] = token.split(".");
    const issued = Number(time);
    if (!signature || !Number.isSafeInteger(issued) || !safeEqual(signature, this.sign(String(issued)))) return "invalid";
    if (now - issued > MAX_FORM_AGE_MS || issued > now + 60_000) return "invalid";
    return now - issued < MIN_FILL_MS ? "too-fast" : "ok";
  }

  add(page: { slug: string; title: string }, submission: Submission): Message {
    const mail = this.mailSettings() ? "pending" : "none";
    const row = this.db
      .query<Row, [string, string, string, string, string, string, string, string]>(
        `INSERT INTO messages (page, page_title, name, email, phone, message, created_at, mail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(page.slug, page.title, submission.name, submission.email, submission.phone, submission.message, new Date().toISOString(), mail)!;
    return toMessage(row);
  }

  // Sends the e-mail copy of a stored message and records whether it worked.
  async notify(message: Message, site: { name: string; origin: string }): Promise<boolean> {
    const settings = this.mailSettings();
    if (!settings) return false;
    try {
      await this.mailer(settings, {
        subject: `Neue Nachricht von ${oneLine(message.name)} über ${oneLine(site.name)}`,
        replyTo: message.email,
        text: [
          `Neue Nachricht über das Kontaktformular auf „${message.pageTitle}“.`,
          "",
          `Name: ${message.name}`,
          `E-Mail: ${message.email}`,
          ...(message.phone ? [`Telefon: ${message.phone}`] : []),
          "",
          message.message,
          "",
          "—",
          `Alle Nachrichten: ${new URL("/admin/messages", site.origin).href}`,
          "Antworte direkt auf diese E-Mail, um zu antworten.",
        ].join("\n"),
      });
      this.db.query("UPDATE messages SET mail = 'sent' WHERE id = ?").run(message.id);
      return true;
    } catch (err) {
      console.error("Kontaktformular: E-Mail konnte nicht gesendet werden:", err instanceof Error ? err.message : err);
      this.db.query("UPDATE messages SET mail = 'failed' WHERE id = ?").run(message.id);
      return false;
    }
  }

  list(): Message[] {
    return this.db.query<Row, []>("SELECT * FROM messages ORDER BY id DESC").all().map(toMessage);
  }

  unread(): number {
    return this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM messages WHERE read_at IS NULL").get()!.n;
  }

  markRead(id: number, read = true) {
    this.db.query("UPDATE messages SET read_at = ? WHERE id = ?").run(read ? new Date().toISOString() : null, id);
  }

  delete(id: number) {
    this.db.query("DELETE FROM messages WHERE id = ?").run(id);
  }

  // Protects the inbox from floods: at most this many messages per hour in total.
  recentCount(minutes: number): number {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    return this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM messages WHERE created_at >= ?").get(since)!.n;
  }

  mailSettings(): MailSettings | null {
    const value = this.setting("mail");
    return value && typeof value === "object" ? (value as MailSettings) : null;
  }

  // Saves the mail server. An empty password keeps the stored one, so it never has to be shown again.
  saveMailSettings(input: Record<string, unknown>): MailSettings {
    const field = (key: string, label: string, max = 200) => {
      const value = String(input[key] ?? "").trim();
      if (value.length > max) throw new ValidationError(`${label} ist zu lang`);
      return value;
    };
    const host = field("host", "Der Mailserver");
    if (!/^[a-z0-9.-]+$/i.test(host)) throw new ValidationError("Bitte den Mailserver angeben, z. B. smtp.example.com");
    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new ValidationError("Der Port muss eine Zahl wie 465 oder 587 sein");
    const security = input.security === "starttls" ? "starttls" : "tls";
    const from = field("from", "Der Absender");
    const to = field("to", "Der Empfänger");
    if (!EMAIL.test(from)) throw new ValidationError("Der Absender muss eine E-Mail-Adresse sein");
    if (!EMAIL.test(to)) throw new ValidationError("Der Empfänger muss eine E-Mail-Adresse sein");
    const password = String(input.password ?? "");
    if (password.length > 500) throw new ValidationError("Das Passwort ist zu lang");
    const settings: MailSettings = {
      host,
      port,
      security,
      user: field("user", "Der Benutzername"),
      password: password || (this.mailSettings()?.password ?? ""),
      from,
      to,
    };
    this.setSetting("mail", settings);
    return settings;
  }

  removeMailSettings() {
    this.db.query("DELETE FROM settings WHERE key = 'mail'").run();
  }

  async sendTest(site: { name: string }): Promise<void> {
    const settings = this.mailSettings();
    if (!settings) throw new ValidationError("Bitte zuerst einen Mailserver eintragen");
    await this.mailer(settings, {
      subject: `Test von ${oneLine(site.name)}`,
      text: "Diese Test-E-Mail zeigt, dass Theta Nachrichten aus dem Kontaktformular an dich weiterleiten kann.",
    });
  }

  private sign(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  private createSecret() {
    const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    this.setSetting("form-secret", secret);
    return secret;
  }

  private setting(key: string): unknown {
    const row = this.db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? JSON.parse(row.value) : null;
  }

  private setSetting(key: string, value: unknown) {
    this.db
      .query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  }
}

export type FieldErrors = Partial<Record<keyof Submission, string>>;

// Checks what a visitor typed. Returns the cleaned message or the problems per field.
export function parseSubmission(form: Record<string, unknown>, withPhone: boolean, english = false): { submission: Submission; errors: FieldErrors } {
  const value = (key: string, max: number) => (typeof form[key] === "string" ? (form[key] as string) : "").trim().slice(0, max);
  const submission: Submission = {
    name: value("name", 200).replace(/\s+/g, " "),
    email: value("email", 254),
    phone: withPhone ? value("phone", 50) : "",
    message: value("message", 5_000).replace(/\r\n?/g, "\n"),
  };
  const errors: FieldErrors = {};
  if (!submission.name) errors.name = english ? "Please enter your name." : "Bitte gib deinen Namen an.";
  if (!EMAIL.test(submission.email)) errors.email = english ? "Please enter a valid e-mail address." : "Bitte gib eine gültige E-Mail-Adresse an.";
  if (submission.phone && !/^[0-9+()/ .-]{4,50}$/.test(submission.phone)) {
    errors.phone = english ? "Please enter only digits, spaces and + ( ) / - ." : "Bitte nur Ziffern, Leerzeichen und + ( ) / - verwenden.";
  }
  if (submission.message.length < 2) errors.message = english ? "Please write a message." : "Bitte schreib eine Nachricht.";
  return { submission, errors };
}

// Limits how often one visitor can send, kept in memory: a restart simply starts over.
export class RateLimit {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.hits.delete(this.hits.keys().next().value!);
    return true;
  }
}

const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ").slice(0, 120);

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
