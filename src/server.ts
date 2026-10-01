import { dirname, join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { renderBlog, renderDashboard, renderDesign, renderLogin, renderMediaLibrary, renderSetup, renderSetupLocked, renderTrash } from "./admin/pages";
import { AuthError, AuthStore, type User } from "./auth";
import { BLOG, HOME, type NavItem, ValidationError, editPath, pagePath, parseBlocks } from "./blocks";
import { openDatabase } from "./db";
import { exportSite } from "./export";
import { MAX_UPLOAD_BYTES, type MediaItem, MediaStore, builtinMedia } from "./media";
import {
  type SiteContext,
  renderBlogIndex,
  renderEditor,
  renderFeed,
  renderNotFound,
  renderPage,
  renderRobots,
  renderSitemap,
} from "./render";
import { ConflictError, parseVersion, PageStore, SettingsStore, parseDescription, parseTitle, slugify } from "./store";
import { zip } from "./zip";
import { type PresetId, PRESETS, defaultTheme, isFontFile, themeCss } from "./theme/tokens";
import { isPageTemplate } from "./templates";

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
    nav: pages.nav(settings.site()),
    legal: pages.legal(settings.site()),
    origin: publicUrl ? new URL(publicUrl).origin : new URL(c.req.url).origin,
    images: (src) => media.info(src),
    themeCss: themeCss(settings.theme()),
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

  app.get("/", (c) => c.html(renderPage(pages.live(HOME)!, siteContext(c))));
  app.get("/sitemap.xml", (c) =>
    c.body(renderSitemap([...pages.publishedPages(), ...pages.posts()], siteContext(c).origin), 200, { "content-type": "application/xml; charset=utf-8" }),
  );
  app.get("/robots.txt", (c) => c.text(renderRobots(siteContext(c).origin)));
  app.get(`/${HOME}`, (c) => c.redirect("/", 301));

  app.get(`/${BLOG}`, (c) => c.html(renderBlogIndex(pages.posts(), siteContext(c))));
  app.get(`/${BLOG}/feed.xml`, (c) =>
    c.body(renderFeed(pages.posts(), settings.site(), siteContext(c).origin), 200, { "content-type": "application/rss+xml; charset=utf-8" }),
  );
  // Drafts are only visible in the editor.
  app.get(`/${BLOG}/:slug{[a-z0-9-]+}`, (c) => {
    const post = pages.post(c.req.param("slug"));
    return post ? c.html(renderPage(post, siteContext(c))) : c.html(renderNotFound(siteContext(c)), 404);
  });

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
  app.use("/admin/*", async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); });
  app.use("/api/*", async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); });
  app.use("/admin", async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); });
  app.use("/edit", async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); });
  app.use("/edit/*", async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); });

  app.use("/edit", requireUser);
  app.use("/edit/*", requireUser);
  app.use("/admin", requireUser);
  app.use("/admin/*", requireUser);
  app.use("/api/*", requireUser);

  const editor = (c: Context<Env>, slug: string) => {
    const page = pages.get(slug);
    if (!page) return c.html(renderNotFound(siteContext(c)), 404);
    const posts = pages.posts({ drafts: true });
    // Everything a button can link to.
    const targets: NavItem[] = [
      ...pages.list().map(({ slug, title }) => ({ slug, title })),
      ...(posts.some((post) => post.publishedAt) ? [{ slug: BLOG, title: "Blog", href: `/${BLOG}` }] : []),
      ...posts.map((post) => ({ slug: post.slug, title: post.title, href: pagePath(post) })),
    ];
    return c.html(renderEditor({ page, site: settings.site(), nav: pages.nav(settings.site()), legal: pages.legal(settings.site()), pages: targets, templates: settings.templates() }, themeCss(settings.theme())));
  };
  app.get("/edit", (c) => editor(c, HOME));
  app.get(`/edit/${HOME}`, (c) => c.redirect("/edit"));
  app.get("/edit/:slug", (c) => editor(c, c.req.param("slug")));

  const dashboard = (c: Context<Env>, error?: string) =>
    c.html(
      renderDashboard({ user: c.get("user"), pages: pages.list(), site: settings.site(), media: media.list(), origin: siteContext(c).origin, error }),
      error ? 400 : 200,
    );

  app.get("/admin", (c) => dashboard(c));

  app.post("/admin/pages", async (c) => {
    const form = await c.req.parseBody();
    try {
      return c.redirect(editPath(pages.create(String(form.title ?? ""), c.get("user").name, "page", isPageTemplate(form.template) ? form.template : "blank").slug));
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return dashboard(c, err.message);
      throw err;
    }
  });

  app.post("/admin/pages/:slug/move", async (c) => {
    const form = await c.req.parseBody();
    pages.move(c.req.param("slug"), form.direction === "up" ? -1 : 1);
    return c.redirect("/admin");
  });

  app.post("/admin/pages/:slug/delete", async (c) => {
    const form = await c.req.parseBody();
    try {
      pages.delete(c.req.param("slug"), parseVersion(Number(form.version)));
      return c.redirect("/admin");
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return dashboard(c, err.message);
      throw err;
    }
  });

  // Blog

  const blog = (c: Context<Env>, error?: string) =>
    c.html(renderBlog({ user: c.get("user"), posts: pages.posts({ drafts: true }), error }), error ? 400 : 200);

  app.get("/admin/blog", (c) => blog(c));

  app.post("/admin/blog", async (c) => {
    const form = await c.req.parseBody();
    try {
      return c.redirect(editPath(pages.create(String(form.title ?? ""), c.get("user").name, "post").slug));
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return blog(c, err.message);
      throw err;
    }
  });

  app.post("/admin/blog/:slug/publish", async (c) => {
    const form = await c.req.parseBody();
    try {
      pages.publish(c.req.param("slug"), form.published === "1", parseVersion(Number(form.version)));
      return c.redirect("/admin/blog");
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return blog(c, err.message);
      throw err;
    }
  });

  app.post("/admin/blog/:slug/delete", async (c) => {
    const form = await c.req.parseBody();
    try {
      if (pages.get(c.req.param("slug"))?.kind !== "post") return blog(c, "Beitrag nicht gefunden");
      pages.delete(c.req.param("slug"), parseVersion(Number(form.version)));
      return c.redirect("/admin/blog");
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return blog(c, err.message);
      throw err;
    }
  });

  app.get("/admin/trash", (c) => c.html(renderTrash({ user: c.get("user"), pages: pages.trash() })));
  app.post("/admin/trash/:slug/restore", async (c) => {
    const form = await c.req.parseBody();
    try {
      const page = pages.restore(c.req.param("slug"), parseVersion(Number(form.version)));
      return c.redirect(editPath(page.slug));
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return c.html(renderTrash({ user: c.get("user"), pages: pages.trash(), error: err.message }), 409);
      throw err;
    }
  });

  app.get("/admin/preview/:slug", (c) => {
    const page = pages.get(c.req.param("slug"));
    c.header("Cache-Control", "private, no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
    return page ? c.html(renderPage(page, siteContext(c))) : c.notFound();
  });

  app.get("/api/section-templates", (c) => c.json(settings.templates()));
  app.post("/api/section-templates", bodyLimit({ maxSize: 2_000_000 }), async (c) => {
    const body = await c.req.json().catch(() => null);
    try {
      if (!body) throw new ValidationError("Ungültige Vorlage");
      return c.json(settings.saveTemplate(body.title, body.blocks), 201);
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });
  app.delete("/api/section-templates/:id", (c) => {
    settings.deleteTemplate(c.req.param("id"));
    return c.json({ ok: true });
  });

  // Media library

  // Which pages use each uploaded image, so deleting one in use can warn first.
  const mediaUsage = () => {
    const usage = new Map<string, string[]>();
    for (const page of pages.all()) {
      for (const [, id] of JSON.stringify(page.blocks).matchAll(/\/media\/([\w-]+)\//g)) {
        const titles = usage.get(id!) ?? [];
        if (!titles.includes(page.title)) usage.set(id!, [...titles, page.title]);
      }
    }
    // Saved templates must also remain usable after their source page changes.
    for (const template of settings.templates()) {
      for (const [, id] of JSON.stringify(template.blocks).matchAll(/\/media\/([\w-]+)\//g)) {
        usage.set(id!, [...(usage.get(id!) ?? []), `Vorlage: ${template.title}`]);
      }
    }
    // The logo is used on every page.
    const logo = settings.site().logo.match(/^\/media\/([\w-]+)\//)?.[1];
    if (logo) usage.set(logo, [...(usage.get(logo) ?? []), "Logo"]);
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
    if (mediaUsage().has(c.req.param("id"))) return library(c, "Dieses Bild wird noch in einer Seite, einer veröffentlichten Fassung oder im Verlauf verwendet.");
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

  // Design

  const design = (c: Context<Env>, error?: string) =>
    c.html(renderDesign({ user: c.get("user"), theme: settings.theme(), error }), error ? 400 : 200);

  app.get("/admin/design", (c) => design(c));

  // Choosing a preset starts over from its defaults.
  app.post("/admin/design/preset", async (c) => {
    const { preset } = await c.req.parseBody();
    if (typeof preset !== "string" || !Object.hasOwn(PRESETS, preset)) return design(c, "Unbekannte Vorlage");
    settings.saveTheme(defaultTheme(preset as PresetId));
    return c.redirect("/admin/design");
  });

  app.post("/admin/design", async (c) => {
    try {
      settings.saveTheme(await c.req.parseBody());
      return c.redirect("/admin/design");
    } catch (err) {
      if (err instanceof ValidationError) return design(c, err.message);
      throw err;
    }
  });

  // The whole site as a ZIP of static files, for hosting anywhere.
  app.post("/admin/export", async (c) => {
    const form = await c.req.parseBody();
    let origin: string;
    try {
      const url = new URL(String(form.url ?? ""));
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      origin = url.origin;
    } catch {
      return dashboard(c, "Bitte die Adresse der Website angeben, z. B. https://meine-seite.de");
    }
    const archive = zip(await exportSite({ pages, settings, media }, origin));
    return new Response(archive, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${slugify(settings.site().name)}-website.zip"`,
      },
    });
  });

  app.post("/admin/site", async (c) => {
    const form = await c.req.parseBody();
    try {
      settings.saveSite({
        name: form.name,
        description: form.description ?? "",
        language: form.language,
        logo: form.logo ?? "",
        footer: form.footer ?? "",
        imprint: form.imprint ?? "",
        privacy: form.privacy ?? "",
      });
      return c.redirect("/admin");
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return dashboard(c, err.message);
      throw err;
    }
  });

  app.get("/api/pages/:slug", (c) => {
    const page = pages.get(c.req.param("slug"));
    return page ? c.json(page) : c.json({ error: "Seite nicht gefunden" }, 404);
  });

  app.get("/api/pages/:slug/revisions", (c) => {
    const slug = c.req.param("slug");
    return pages.get(slug) ? c.json(pages.revisions(slug)) : c.json({ error: "Seite nicht gefunden" }, 404);
  });

  app.get("/api/pages/:slug/revisions/:id{[0-9]+}", (c) => {
    const revision = pages.revision(c.req.param("slug"), Number(c.req.param("id")));
    return revision ? c.json(revision) : c.json({ error: "Version nicht gefunden" }, 404);
  });

  app.put("/api/pages/:slug", bodyLimit({ maxSize: 2_000_000 }), async (c) => {
    const page = pages.get(c.req.param("slug"));
    if (!page) return c.json({ error: "Seite nicht gefunden" }, 404);

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Ungültiges JSON" }, 400);
    try {
      const version = parseVersion(body.version);
      const action = body.action ?? "save";
      if (action !== "save" && action !== "publish" && action !== "unpublish") throw new ValidationError("Unbekannte Speicheraktion");
      return c.json(
        pages.save(page.slug, {
          title: body.title === undefined ? undefined : parseTitle(body.title),
          description: body.description === undefined ? undefined : parseDescription(body.description),
          inNav: body.inNav === undefined ? undefined : body.inNav === true,
          blocks: body.blocks === undefined ? undefined : parseBlocks(body.blocks),
        }, c.get("user").name, { version, action, autosave: body.autosave === true }),
      );
    } catch (err) {
      if (err instanceof ConflictError) return c.json({ error: err.message, conflict: true }, 409);
      if (err instanceof ValidationError) return c.json({ error: err.message, block: err.block }, 400);
      throw err;
    }
  });

  // Static files

  app.get("/assets/theme.css", (c) => c.body(asset("./theme/theme.css").stream(), 200, css));
  app.get("/assets/admin.css", (c) => c.body(asset("./admin/admin.css").stream(), 200, css));
  app.get("/assets/editor.css", (c) => c.body(asset("./editor/editor.css").stream(), 200, css));
  // Bundled fonts; a new Theta version may replace a file, so browsers check back after a week.
  app.get("/assets/fonts/:name", (c) => {
    const name = c.req.param("name");
    if (!isFontFile(name)) return c.notFound();
    return new Response(asset(`./theme/fonts/${name}`), { headers: { "content-type": name.endsWith(".woff") ? "font/woff" : "font/woff2", "cache-control": "public, max-age=604800" } });
  });
  app.get("/assets/editor.js", async (c) => c.body(await buildEditor(), 200, { "content-type": "text/javascript; charset=utf-8" }));

  // Uploaded images never change under their address, so browsers may keep them for a year.
  app.get("/media/:id/:name", (c) => {
    const path = media.path(c.req.param("id"), c.req.param("name"));
    if (!path) return c.notFound();
    return new Response(Bun.file(path), { headers: { "cache-control": "public, max-age=31536000, immutable" } });
  });

  app.get("/media/:name", (c) => {
    const path = builtinMedia(c.req.param("name"));
    return path ? new Response(Bun.file(path)) : c.notFound();
  });

  // Every other page of the site. Registered last so it cannot shadow the routes above.
  app.get("/:slug{[a-z0-9-]+}", (c) => {
    const page = pages.live(c.req.param("slug"));
    // Posts live under /blog only.
    return page?.kind === "page" ? c.html(renderPage(page, siteContext(c))) : c.html(renderNotFound(siteContext(c)), 404);
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
