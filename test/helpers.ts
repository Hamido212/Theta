import { AuthStore } from "../src/auth";
import { ContactStore, type Mailer } from "../src/contact";
import type { Geocoder } from "../src/geocode";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { MediaStore } from "../src/media";
import { createApp } from "../src/server";
import { PageStore, SettingsStore } from "../src/store";

export const SETUP_TOKEN = "test-setup-token";

// Collects e-mails instead of sending them. Set fail to make sending throw.
export function fakeMailer() {
  const sent: Parameters<Mailer>[] = [];
  const control = { fail: false };
  const mailer: Mailer = async (...args) => {
    if (control.fail) throw new Error("Verbindung abgelehnt");
    sent.push(args);
  };
  return { mailer, sent, control };
}

// Answers address searches without asking OpenStreetMap. Set fail to make it throw.
export function fakeGeocoder() {
  const queries: string[] = [];
  const control = { fail: false };
  const geocoder: Geocoder = async (query, language) => {
    queries.push(`${language}:${query}`);
    if (control.fail) throw new Error("offline");
    return [{ lat: 52.497, lon: 13.4182, name: "4, Lindenstraße, Kreuzberg, Berlin, 10969, Deutschland" }];
  };
  return { geocoder, queries, control };
}

// A fresh in-memory site. With login: true it also has an account and a session cookie.
export async function testSite({ login = false } = {}) {
  const db = openDatabase(":memory:");
  const auth = new AuthStore(db);
  const pages = new PageStore(db);
  const settings = new SettingsStore(db);
  const uploads = mkdtempSync(join(tmpdir(), "theta-uploads-"));
  const media = new MediaStore(db, uploads);
  const mail = fakeMailer();
  const contact = new ContactStore(db, mail.mailer);
  let cookie = "";
  if (login) {
    const user = await auth.createUser({ email: "test@example.com", name: "Test", password: "richtig-geheim" });
    cookie = `theta_session=${auth.createSession(user.id).token}`;
  }
  const places = fakeGeocoder();
  const app = createApp({ pages, settings, media, auth, contact, geocoder: places.geocoder, setupToken: SETUP_TOKEN });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { cookie, ...init.headers } });
  return { app, auth, pages, settings, media, uploads, db, request, contact, mail, places };
}

export const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
  body: new URLSearchParams(fields).toString(),
});
