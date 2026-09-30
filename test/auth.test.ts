import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthError, AuthStore } from "../src/auth";
import { openDatabase } from "../src/db";
import { SETUP_TOKEN, form, testSite } from "./helpers";

const cookieFrom = (res: Response) => res.headers.get("set-cookie")?.match(/theta_session=([^;]*)/)?.[1] ?? "";

describe("first setup", () => {
  test("editing without an account leads to setup", async () => {
    const { request } = await testSite();
    const res = await request("/edit");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/setup");
  });

  test("setup needs the secret link", async () => {
    const { request } = await testSite();
    expect((await request("/setup")).status).toBe(403);
    expect((await request("/setup?token=falsch")).status).toBe(403);
    expect((await request(`/setup?token=${SETUP_TOKEN}`)).status).toBe(200);
    const res = await request("/setup", form({ token: "falsch", name: "A", email: "a@b.de", password: "0123456789", password2: "0123456789" }));
    expect(res.status).toBe(403);
  });

  test("setup creates the account, logs in and then closes", async () => {
    const { request, auth } = await testSite();
    const fields = { token: SETUP_TOKEN, name: "Hamid", email: "hamid@example.com", password: "sehr-geheim-1", password2: "sehr-geheim-1" };

    const mismatch = await request("/setup", form({ ...fields, password2: "anders-geheim" }));
    expect(mismatch.status).toBe(400);
    expect(await mismatch.text()).toContain("stimmen nicht überein");

    const res = await request("/setup", form(fields));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/edit");
    const cookie = cookieFrom(res);
    expect(auth.userForSession(cookie)?.email).toBe("hamid@example.com");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");

    const again = await request(`/setup?token=${SETUP_TOKEN}`);
    expect(again.status).toBe(302);
    expect(again.headers.get("location")).toBe("/login");
  });
});

describe("login", () => {
  test("protected pages redirect to login, the API answers 401", async () => {
    const { request, auth } = await testSite();
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    const res = await request("/edit");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fedit");
    expect((await request("/api/pages/home")).status).toBe(401);
    const put = await request("/api/pages/home", { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
    expect(put.status).toBe(401);
  });

  test("wrong password is refused, right password logs in and redirects", async () => {
    const { request, auth } = await testSite();
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });

    const wrong = await request("/login", form({ email: "a@example.com", password: "falsch-geheim" }));
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("E-Mail oder Passwort ist falsch.");

    const ok = await request("/login", form({ email: "A@Example.com", password: "richtig-geheim", next: "/edit" }));
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("/edit");
    const edit = await request("/edit", { headers: { cookie: `theta_session=${cookieFrom(ok)}` } });
    expect(edit.status).toBe(200);
  });

  test("login only redirects within the site", async () => {
    const { request, auth } = await testSite();
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      const res = await request("/login", form({ email: "a@example.com", password: "richtig-geheim", next }));
      expect(res.headers.get("location")).toBe("/admin");
    }
  });

  test("logout ends the session", async () => {
    const { request, auth } = await testSite({ login: true });
    const res = await request("/logout", form({}));
    expect(res.status).toBe(302);
    expect((await request("/edit")).status).toBe(302);
    expect(auth.hasUsers()).toBe(true);
  });

  test("form posts from other sites are rejected", async () => {
    const { request, auth } = await testSite();
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    const res = await request("/login", {
      ...form({ email: "a@example.com", password: "richtig-geheim" }),
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });
});

describe("AuthStore", () => {
  test("rejects short passwords and duplicate addresses", async () => {
    const auth = new AuthStore(openDatabase(":memory:"));
    await expect(auth.createUser({ email: "a@example.com", name: "A", password: "kurz" })).rejects.toThrow(AuthError);
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    await expect(auth.createUser({ email: "A@example.com", name: "B", password: "richtig-geheim" })).rejects.toThrow("schon vergeben");
  });

  test("locks an address after too many failed attempts", async () => {
    const auth = new AuthStore(openDatabase(":memory:"));
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    for (let i = 0; i < 10; i++) expect(await auth.verify("a@example.com", "falsch")).toBeNull();
    await expect(auth.verify("a@example.com", "richtig-geheim")).rejects.toThrow("Zu viele Fehlversuche");
  });

  test("resetting the password ends all sessions", async () => {
    const auth = new AuthStore(openDatabase(":memory:"));
    const user = await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    const { token } = auth.createSession(user.id);
    await auth.setPassword("a@example.com", "ganz-neues-passwort");
    expect(auth.userForSession(token)).toBeNull();
    expect(await auth.verify("a@example.com", "ganz-neues-passwort")).not.toBeNull();
  });

  test("expired sessions are not accepted", async () => {
    const db = openDatabase(":memory:");
    const auth = new AuthStore(db);
    const user = await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    const { token } = auth.createSession(user.id);
    db.run("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'");
    expect(auth.userForSession(token)).toBeNull();
  });
});

test("databases from the prototype are upgraded in place", () => {
  const path = join(tmpdir(), `theta-migrate-${crypto.randomUUID()}.db`);
  const old = new Database(path);
  old.run("CREATE TABLE pages (slug TEXT PRIMARY KEY, title TEXT NOT NULL, blocks TEXT NOT NULL, updated_at TEXT NOT NULL)");
  old.run("INSERT INTO pages VALUES ('home', 'Alt', '[]', '2026-09-30T00:00:00.000Z')");
  old.close();

  const db = openDatabase(path);
  expect(db.query("SELECT title FROM pages").get()).toEqual({ title: "Alt" });
  expect(new AuthStore(db).hasUsers()).toBe(false);
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
});
