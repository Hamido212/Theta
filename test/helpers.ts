import { AuthStore } from "../src/auth";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { MediaStore } from "../src/media";
import { createApp } from "../src/server";
import { PageStore, SettingsStore } from "../src/store";

export const SETUP_TOKEN = "test-setup-token";

// A fresh in-memory site. With login: true it also has an account and a session cookie.
export async function testSite({ login = false } = {}) {
  const db = openDatabase(":memory:");
  const auth = new AuthStore(db);
  const pages = new PageStore(db);
  const settings = new SettingsStore(db);
  const uploads = mkdtempSync(join(tmpdir(), "theta-uploads-"));
  const media = new MediaStore(db, uploads);
  let cookie = "";
  if (login) {
    const user = await auth.createUser({ email: "test@example.com", name: "Test", password: "richtig-geheim" });
    cookie = `theta_session=${auth.createSession(user.id).token}`;
  }
  const app = createApp({ pages, settings, media, auth, setupToken: SETUP_TOKEN });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { cookie, ...init.headers } });
  return { app, auth, pages, settings, media, uploads, db, request };
}

export const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
  body: new URLSearchParams(fields).toString(),
});
