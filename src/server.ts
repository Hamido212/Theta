import { dirname, join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { renderDashboard, renderLogin, renderMediaLibrary, renderSetup, renderSetupLocked } from "./admin/pages";
import { AuthError, AuthStore, type User } from "./auth";
import { HOME, ValidationError, editPath, parseBlocks } from "./blocks";
import { openDatabase } from "./db";
import { MAX_UPLOAD_BYTES, type MediaItem, MediaStore } from "./media";
import { type SiteContext, renderEditor, renderNotFound, renderPage, renderRobots, renderSitemap } from "./render";
import { PageStore, SettingsStore, parseDescription, parseTitle } from "./store";

const SESSION_COOKIE = "theta_session";

// Bundles the browser editor once, on first request.
let editorBundle: Promise<string> | undefined;
function buildEditor(): Promise<string> {
  editorBundle ??= Bun.build({
    entrypoints: [join(import.meta.dir, "editor", "main.tsx")],
    target: "browser",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  }).then((result) => {
    if (!result.success || !result.outputs[0]) {
      editorBundle = undefined;
      throw new AggregateError(result.logs, "Editor konnte nicht gebaut werden");
    }
    return result.outputs[0].text();
  });
  return editorBundle;
}

const asset = (path: string) => Bun.file(new URL(path, import.meta.url));
const css = { "content-type": "text/css; charset=utf-8" };

export type AppOptions = {
  pages: PageStore;
  settings: SettingsStore;
  media: MediaStore;
  auth: AuthStore;
  // Secret for the one-time setup link. Only set while no account exists.
  setupToken?: string;
  // Public address of the site, e.g. https://example.com, when running behind a proxy.
  publicUrl?: string;
};

type Env = { Variables: { user: User } };

export function createApp({ pages, settings, media, auth, setupToken, publicUrl }: AppOptions) {
  const app = new Hono<Env>();

  const siteContext = (c: Context<Env>): SiteContext => ({
    site: settings.site(),
    nav: pages.nav(),
    origin: publicUrl ? new URL(publicUrl).origin : new URL(c.req.url).origin,
    images: (src) => media.info(src),
  });

  // Rejects form posts from other sites, so nobody can act in the name of a logged-in user.
  app.use(csrf(publicUrl ? { origin: new URL(publicUrl).origin } : undefined));

  const currentUser = (c: Context<Env>) => {
    const token = getCookie(c, SESSION_COOKIE);
    return token ? auth.userForSession(token) : null;
  };

  const requireUser: MiddlewareHandler<Env> = async (c, next) => {
    const user = currentUser(c);
    if (!user) {
      if (c.req.path.startsWith("/api/")) return c.json({ error: "Bitte zuerst anmelden" }, 401);
      if (!auth.hasUsers()) return c.redirect("/setup");
      return c.redirect(`/login?next=${encodeURIComponent(c.req.path)}`);
    }
    c.set("user", user);
    await next();
  };

  const startSession = (c: Context<Env>, user: User) => {
    const { token, expires } = auth.createSession(user.id);
    setCookie(c, SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: (publicUrl ?? c.req.url).startsWith("https:"),
      expires,
    });
  };

  const setupAllowed = (token: unknown) =>
    !auth.hasUsers() && typeof token === "string" && setupToken !== undefined && safeEqual(token, setupToken);

  // Public site

  app.get("/", (c) => c.html(renderPage(pages.get(HOME)!, siteContext(c))));
  app.get("/sitemap.xml", (c) => c.body(renderSitemap(pages.list(), siteContext(c).origin), 200, { "content-type": "application/xml; charset=utf-8" }));
  app.get("/robots.txt", (c) => c.text(renderRobots(siteContext(c).origin)));
  app.get(`/${HOME}`, (c) => c.redirect("/", 301));

  // Accounts

  app.get("/login", (c) => {
    const next = safeNext(c.req.query("next"));
    if (!auth.hasUsers()) return c.redirect("/setup");
    if (currentUser(c)) return c.redirect(next);
    return c.html(renderLogin({ next }));
  });

  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const email = String(form.email ?? "");
    const next = safeNext(form.next);
    try {
      const user = await auth.verify(email, String(form.password ?? ""));
      if (!user) return c.html(renderLogin({ error: "E-Mail oder Passwort ist falsch.", email, next }), 401);
      startSession(c, user);
      return c.redirect(next);
    } catch (err) {
      if (err instanceof AuthError) return c.html(renderLogin({ error: err.message, email, next }), 429);
      throw err;
    }
  });

  app.post("/logout", (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) auth.deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect("/");
  });

  app.get("/setup", (c) => {
    if (auth.hasUsers()) return c.redirect("/login");
    const token = c.req.query("token");
    if (!setupAllowed(token)) return c.html(renderSetupLocked(), 403);
    return c.html(renderSetup({ token: token! }));
  });

  app.post("/setup", async (c) => {
    if (auth.hasUsers()) return c.redirect("/login");
    const form = await c.req.parseBody();
    if (!setupAllowed(form.token)) return c.html(renderSetupLocked(), 403);

    const input = { name: String(form.name ?? ""), email: String(form.email ?? ""), password: String(form.password ?? "") };
    const retry = (error: string) => c.html(renderSetup({ token: String(form.token), error, name: input.name, email: input.email }), 400);
    if (input.password !== String(form.password2 ?? "")) return retry("Die Passwörter stimmen nicht überein.");
    try {
      startSession(c, await auth.createUser(input));
      return c.redirect("/edit");
    } catch (err) {
      if (err instanceof AuthError) return retry(err.message);
      throw err;
    }
  });

  // Editing (login required)

  app.use("/edit", requireUser);
  app.use("/edit/*", requireUser);
  app.use("/admin", requireUser);
  app.use("/admin/*", requireUser);
  app.use("/api/*", requireUser);

  const editor = (c: Context<Env>, slug: string) => {
    const page = pages.get(slug);
    if (!page) return c.html(renderNotFound(siteContext(c)), 404);
    const all = pages.list().map(({ slug, title }) => ({ slug, title }));
    return c.html(renderEditor({ page, site: settings.site(), nav: pages.nav(), pages: all }));
  };
  app.get("/edit", (c) => editor(c, HOME));
  app.get(`/edit/${HOME}`, (c) => c.redirect("/edit"));
  app.get("/edit/:slug", (c) => editor(c, c.req.param("slug")));

  const dashboard = (c: Context<Env>, error?: string) =>
    c.html(renderDashboard({ user: c.get("user"), pages: pages.list(), site: settings.site(), error }), error ? 400 : 200);

  app.get("/admin", (c) => dashboard(c));

  app.post("/admin/pages", async (c) => {
    const form = await c.req.parseBody();
    try {
      return c.redirect(editPath(pages.create(String(form.title ?? "")).slug));
    } catch (err) {
      if (err instanceof ValidationError) return dashboard(c, err.message);
      throw err;
    }
  });

  app.post("/admin/pages/:slug/move", async (c) => {
    const form = await c.req.parseBody();
    pages.move(c.req.param("slug"), form.direction === "up" ? -1 : 1);
    return c.redirect("/admin");
  });

  app.post("/admin/pages/:slug/delete", (c) => {
    try {
      pages.delete(c.req.param("slug"));
      return c.redirect("/admin");
    } catch (err) {
      if (err instanceof ValidationError) return dashboard(c, err.message);
      throw err;
    }
  });

  // Media library

  // Which pages use each uploaded image, so deleting one in use can warn first.
  const mediaUsage = () => {
    const usage = new Map<string, string[]>();
    for (const page of pages.list()) {
      for (const [, id] of JSON.stringify(page.blocks).matchAll(/\/media\/([\w-]+)\//g)) {
        const titles = usage.get(id!) ?? [];
        if (!titles.includes(page.title)) usage.set(id!, [...titles, page.title]);
      }
    }
    return usage;
  };

  const library = (c: Context<Env>, error?: string) =>
    c.html(renderMediaLibrary({ user: c.get("user"), items: media.list(), usage: mediaUsage(), error }), error ? 400 : 200);

  // Stores every uploaded file; stops at the first one that is not a usable image.
  const upload = async (c: Context<Env>): Promise<MediaItem[]> => {
    const form = await c.req.parseBody({ all: true });
    const files = [form.file].flat().filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length === 0) throw new ValidationError("Bitte mindestens ein Bild auswählen");
    const added: MediaItem[] = [];
    for (const file of files) added.push(await media.add(file));
    return added;
  };

  const uploadLimit = bodyLimit({
    maxSize: 5 * MAX_UPLOAD_BYTES,
    onError: (c) => c.text("Die Dateien sind zusammen zu groß (höchstens 100 MB auf einmal).", 413),
  });

  app.get("/admin/media", (c) => library(c));

  app.post("/admin/media", uploadLimit, async (c) => {
    try {
      await upload(c);
      return c.redirect("/admin/media");
    } catch (err) {
      if (err instanceof ValidationError) return library(c, err.message);
      throw err;
    }
  });

  app.post("/admin/media/:id/delete", (c) => {
    media.delete(c.req.param("id"));
    return c.redirect("/admin/media");
  });

  app.get("/api/media", (c) => c.json(media.list()));

  app.post("/api/media", uploadLimit, async (c) => {
    try {
      return c.json(await upload(c), 201);
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.post("/admin/site", async (c) => {
    const form = await c.req.parseBody();
    try {
      settings.saveSite({ name: form.name, description: form.description ?? "" });
      return c.redirect("/admin");
    } catch (err) {
      if (err instanceof ValidationError) return dashboard(c, err.message);
      throw err;
    }
  });

  app.get("/api/pages/:slug", (c) => {
    const page = pages.get(c.req.param("slug"));
    return page ? c.json(page) : c.json({ error: "Seite nicht gefunden" }, 404);
  });

  app.put("/api/pages/:slug", async (c) => {
    const page = pages.get(c.req.param("slug"));
    if (!page) return c.json({ error: "Seite nicht gefunden" }, 404);

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "Ungültiges JSON" }, 400);
    try {
      return c.json(
        pages.save(page.slug, {
          title: body.title === undefined ? undefined : parseTitle(body.title),
          description: body.description === undefined ? undefined : parseDescription(body.description),
          inNav: body.inNav === undefined ? undefined : body.inNav === true,
          blocks: parseBlocks(body.blocks),
        }),
      );
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  // Static files

  app.get("/assets/theme.css", (c) => c.body(asset("./theme/theme.css").stream(), 200, css));
  app.get("/assets/admin.css", (c) => c.body(asset("./admin/admin.css").stream(), 200, css));
  app.get("/assets/editor.css", (c) => c.body(asset("./editor/editor.css").stream(), 200, css));
  app.get("/assets/editor.js", async (c) => c.body(await buildEditor(), 200, { "content-type": "text/javascript; charset=utf-8" }));

  // Uploaded images never change under their address, so browsers may keep them for a year.
  app.get("/media/:id/:name", (c) => {
    const path = media.path(c.req.param("id"), c.req.param("name"));
    if (!path) return c.notFound();
    return new Response(Bun.file(path), { headers: { "cache-control": "public, max-age=31536000, immutable" } });
  });

  app.get("/media/:name", async (c) => {
    const name = c.req.param("name");
    if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) return c.notFound();
    const file = Bun.file(new URL(`../media/${name}`, import.meta.url));
    if (!(await file.exists())) return c.notFound();
    return new Response(file);
  });

  // Every other page of the site. Registered last so it cannot shadow the routes above.
  app.get("/:slug{[a-z0-9-]+}", (c) => {
    const page = pages.get(c.req.param("slug"));
    return page ? c.html(renderPage(page, siteContext(c))) : c.html(renderNotFound(siteContext(c)), 404);
  });

  app.notFound((c) => c.html(renderNotFound(siteContext(c)), 404));

  return app;
}

// Only allow redirects to paths on this site.
function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/admin";
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

if (import.meta.main) {
  const dbPath = process.env.THETA_DB ?? "theta.db";
  const db = openDatabase(dbPath);
  const media = new MediaStore(db, process.env.THETA_UPLOADS ?? join(dirname(dbPath), "uploads"));
  const auth = new AuthStore(db);
  const publicUrl = process.env.THETA_URL;
  const setupToken = auth.hasUsers() ? undefined : Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");

  const server = Bun.serve({
    hostname: process.env.THETA_HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
    fetch: createApp({ pages: new PageStore(db), settings: new SettingsStore(db), media, auth, setupToken, publicUrl }).fetch,
  });

  const base = publicUrl ?? server.url;
  console.log(`Theta läuft auf ${base}`);
  if (setupToken) {
    console.log(`\nNoch kein Konto vorhanden. Richte Theta hier ein:\n${new URL(`/setup?token=${setupToken}`, base)}\n`);
  } else {
    console.log(`Verwalten: ${new URL("/admin", base)}`);
  }
}
