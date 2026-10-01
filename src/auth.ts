import type { Database } from "bun:sqlite";

export type User = { id: number; email: string; name: string };

const SESSION_DAYS = 30;
const MIN_PASSWORD = 10;

// Brute-force protection: after this many failed logins for one address, further
// attempts are refused until the window has passed.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export class AuthError extends Error {}

export class AuthStore {
  private failures = new Map<string, { count: number; since: number; hash?: string }>();

  constructor(private db: Database) {}

  hasUsers(): boolean {
    return this.db.query("SELECT 1 FROM users LIMIT 1").get() !== null;
  }

  async createUser(input: { email: string; name: string; password: string }): Promise<User> {
    const email = input.email.trim();
    const name = input.name.trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new AuthError("Bitte eine gültige E-Mail-Adresse eingeben.");
    if (name === "") throw new AuthError("Bitte einen Namen eingeben.");
    checkPassword(input.password);

    const hash = await Bun.password.hash(input.password);
    try {
      const row = this.db
        .query<{ id: number }, [string, string, string, string]>(
          "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id",
        )
        .get(email, name, hash, new Date().toISOString())!;
      return { id: row.id, email, name };
    } catch (err) {
      if (String(err).includes("UNIQUE")) throw new AuthError("Diese E-Mail-Adresse ist schon vergeben.");
      throw err;
    }
  }

  async setPassword(email: string, password: string): Promise<void> {
    checkPassword(password);
    const hash = await Bun.password.hash(password);
    const result = this.db.query("UPDATE users SET password_hash = ? WHERE email = ?").run(hash, email.trim());
    if (result.changes === 0) throw new AuthError(`Kein Konto mit der Adresse ${email}.`);
    this.db.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)").run(email.trim());
  }

  // Returns the user when email and password match, otherwise null.
  async verify(email: string, password: string): Promise<User | null> {
    const key = email.trim().toLowerCase();
    const row = this.db
      .query<User & { password_hash: string }, [string]>(
        "SELECT id, email, name, password_hash FROM users WHERE email = ?",
      )
      .get(email.trim());
    // A new password, e.g. from `theta reset-password` while Theta runs, starts a fresh count.
    const failure = this.failures.get(key);
    if (failure && (Date.now() - failure.since > FAILURE_WINDOW_MS || failure.hash !== row?.password_hash)) this.failures.delete(key);
    if ((this.failures.get(key)?.count ?? 0) >= MAX_FAILURES) {
      throw new AuthError("Zu viele Fehlversuche. Bitte in ein paar Minuten erneut versuchen.");
    }

    // Verify against a dummy hash for unknown addresses so timing does not reveal which exist.
    const ok = await Bun.password.verify(password, row?.password_hash ?? (await dummyHash));
    if (row && ok) {
      this.failures.delete(key);
      return { id: row.id, email: row.email, name: row.name };
    }
    const current = this.failures.get(key) ?? { count: 0, since: Date.now(), hash: row?.password_hash };
    this.failures.set(key, { ...current, count: current.count + 1 });
    if (this.failures.size > 1000) this.forgetOldFailures();
    return null;
  }

  // Creates a session and returns the secret token for the cookie. Only its hash is stored.
  createSession(userId: number): { token: string; expires: Date } {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    this.db.query("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
    this.db
      .query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(hashToken(token), userId, expires.toISOString());
    return { token, expires };
  }

  userForSession(token: string): User | null {
    return this.db
      .query<User, [string, string]>(
        `SELECT users.id, users.email, users.name FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(hashToken(token), new Date().toISOString());
  }

  deleteSession(token: string) {
    this.db.query("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  private forgetOldFailures() {
    const cutoff = Date.now() - FAILURE_WINDOW_MS;
    for (const [key, { since }] of this.failures) if (since < cutoff) this.failures.delete(key);
  }
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD) {
    throw new AuthError(`Das Passwort muss mindestens ${MIN_PASSWORD} Zeichen lang sein.`);
  }
}

function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

const dummyHash = Bun.password.hash(crypto.randomUUID());
