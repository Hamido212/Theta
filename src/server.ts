import { dirname, join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { renderBlog, renderDashboard, renderDesign, renderLogin, renderMediaLibrary, renderMessages, renderSetup, renderSetupLocked, renderTrash, renderSharedSections } from "./admin/pages";
import { assetFile, isCompiled } from "./assets";
import { AuthError, AuthStore, type User } from "./auth";
import { BackupError, Backups, MAX_BACKUP_BYTES, backupName } from "./backup";
import { BLOG, type FormBlock, HOME, type NavItem, type Page, ValidationError, editPath, pagePath, parseBlocks, publicPath } from "./blocks";
import { ContactStore, RateLimit, parseSubmission } from "./contact";
import { type Geocoder, nominatim } from "./geocode";
import { openDatabase } from "./db";
import { exportSite } from "./export";
import { MAX_UPLOAD_BYTES, type MediaItem, MediaStore, builtinMedia } from "./media";
import {
  type SiteContext,
  postSummaries,
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
import { type FormSetup, formAnchor } from "./theme/form";
import { liveContent } from "./shared-sections";

const SESSION_COOKIE = "theta_session";

// Bundles the browser editor once, on first request. The single-file program brings it prebuilt.
let editorBundle: Promise<string> | undefined;
function buildEditor(): Promise<string> {
  if (isCompiled()) return (editorBundle ??= assetFile("build/editor.js").text());
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

const asset = (path: string) => assetFile(`src/${path.replace(/^\.\//, "")}`);
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
  // Inbox for contact forms. Without it, forms are left out of pages.
  contact?: ContactStore;
  // Address search for the map block; OpenStreetMap's Nominatim unless replaced (tests).
  geocoder?: Geocoder;
  // Download and restore of complete backups. Without it, the backup section is hidden.
  backups?: Backups;
  // Downloads pictures pasted from another Theta site; fetch unless replaced (tests).
  download?: typeof fetch;
};

type Env = { Variables: { user: User } };

export function createApp({ pages, settings, media, auth, setupToken, publicUrl, contact, geocoder = nominatim(), backups, download = fetch }: AppOptions) {
  const app = new Hono<Env>();

  // Requests stay below 128 MB, except restoring a backup, which carries all images of a site.
  const restorePaths = new Set(["/admin/restore", "/setup/restore"]);
  const requestLimit = bodyLimit({ maxSize: 128 * 1024 * 1024 });
  const backupLimit = bodyLimit({
    maxSize: MAX_BACKUP_BYTES,
    onError: (c) => c.text("Die Sicherung ist zu groß (höchstens 1 GB).", 413),
  });
  app.use((c, next) => (restorePaths.has(c.req.path) ? backupLimit(c, next) : requestLimit(c, next)));

  const siteContext = (c: Context<Env>): SiteContext => ({
    site: settings.site(),
    nav: pages.nav(settings.site()),
    legal: pages.legal(settings.site()),
    origin: publicUrl ? new URL(publicUrl).origin : new URL(c.req.url).origin,
    images: (src) => media.info(src),
    themeCss: themeCss(settings.theme()),
    sharedSections: Object.fromEntries(pages.sharedSections().flatMap((section) => {
      const live = pages.live(section.slug);
      return live ? [[section.slug, live.blocks]] : [];
    })),
    layoutRules: settings.layoutRules(),
    posts: postSummaries(pages.posts()),
  });

  // Whether a published page or post contains a contact form, directly or in a shared section.
  const hasLiveForm = (c: Context<Env>) => {
    const context = siteContext(c);
    return [...pages.publishedPages(), ...pages.posts()].some((page) => liveContent(page, context).some((block) => block.type === "form"));
  };

  // Rejects form posts from other sites, so nobody can act in the name of a logged-in user.
  app.use(csrf(publicUrl ? { origin: new URL(publicUrl).origin } : undefined));
  // Hono's form CSRF check skips application/json. Explicitly reject foreign
  // origins on authenticated API writes as well, including requests from proxies.
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (!/^(GET|HEAD|OPTIONS)$/.test(c.req.method) && origin && origin !== new URL(publicUrl ?? c.req.url).origin) {
      return c.json({ error: "Diese Änderung muss von deiner Theta-Website ausgehen." }, 403);
    }
    await next();
  });

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

  // An address without a page: follow a redirect if there is one, otherwise "not found".
  // Browsers remember permanent redirects, so they are told to check again after an hour.
  const missing = (c: Context<Env>) => {
    const target = c.req.method === "GET" || c.req.method === "HEAD" ? pages.redirects.find(new URL(c.req.url).pathname) : null;
    if (target) {
      c.header("Cache-Control", "public, max-age=3600");
      return c.redirect(target, 301);
    }
    return c.html(renderNotFound(siteContext(c)), 404);
  };

  // Contact forms post back to the page they are on. ?gesendet=<form> after a redirect shows the thank-you note.
  const formSetup = (c: Context<Env>, path: string, attempt?: FormSetup["attempt"]): FormSetup | undefined => {
    if (!contact) return undefined;
    const site = settings.site();
    const privacy = site.privacy && pages.live(site.privacy) ? publicPath(site.privacy) : undefined;
    return { action: path, token: contact.token(), privacyHref: privacy, english: site.language === "en", sent: attempt ? undefined : c.req.query("gesendet"), attempt };
  };
  const showPage = (c: Context<Env>, page: Page) => c.html(renderPage(page, siteContext(c), formSetup(c, pagePath(page))));

  // Five messages per visitor in ten minutes. Behind a proxy the visitor's address is the last
  // one the proxy added; earlier entries come from the visitor and could be made up.
  const contactLimit = new RateLimit(5, 10 * 60_000);
  const visitor = (c: Context<Env>) =>
    (publicUrl && c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim()) ||
    (c.env as { requestIP?: (request: Request) => { address: string } | null } | undefined)?.requestIP?.(c.req.raw)?.address ||
    "unknown";

  const receiveMessage = async (c: Context<Env>, page: Page | null) => {
    if (!contact || !page) return c.html(renderNotFound(siteContext(c)), 404);
    const context = siteContext(c);
    const path = pagePath(page);
    const body = await c.req.parseBody();
    const formId = typeof body._form === "string" ? body._form : "";
    const block = liveContent(page, context).find((item): item is FormBlock => item.type === "form" && item.id === formId);
    if (!block) return c.html(renderNotFound(context), 404);
    const english = context.site.language === "en";
    const sent = () => c.redirect(`${path}?gesendet=${encodeURIComponent(block.id)}#${formAnchor(block.id)}`, 303);
    // Bots fill in the hidden field. They get the same answer as people, so they learn nothing.
    if (typeof body.website === "string" && body.website !== "") return sent();

    const { submission, errors } = parseSubmission(body, block.phone, english);
    const retry = (notice: string | undefined, status: 422 | 429) =>
      c.html(renderPage(page, context, formSetup(c, path, { block: block.id, values: submission, errors, notice })), status);
    if (Object.keys(errors).length > 0) return retry(undefined, 422);
    const token = contact.checkToken(body._token);
    if (token === "invalid") return retry(english ? "The form had expired. Please send it again." : "Das Formular war abgelaufen. Bitte sende es noch einmal ab.", 422);
    if (token === "too-fast") return retry(english ? "That was very quick. Please check your details and send again." : "Das ging sehr schnell. Bitte prüfe deine Angaben und sende noch einmal ab.", 422);
    if (!contactLimit.allow(visitor(c)) || contact.recentCount(60) >= 100) {
      return retry(english ? "Too many messages right now. Please try again in a few minutes." : "Gerade kommen sehr viele Nachrichten an. Bitte versuch es in ein paar Minuten noch einmal.", 429);
    }
    const message = contact.add({ slug: page.slug, title: page.title }, submission);
    // The visitor does not wait for the mail server; the inbox shows whether the e-mail went out.
    void contact.notify(message, { name: context.site.name, origin: context.origin });
    return sent();
  };

  app.get("/", (c) => showPage(c, pages.live(HOME)!));
  app.post("/", (c) => receiveMessage(c, pages.live(HOME)));
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
    return post ? showPage(c, post) : missing(c);
  });
  app.post(`/${BLOG}/:slug{[a-z0-9-]+}`, (c) => receiveMessage(c, pages.post(c.req.param("slug"))));

  // Accounts

  app.get("/login", (c) => {
    const next = safeNext(c.req.query("next"));
    if (!auth.hasUsers()) return c.redirect("/setup");
    if (currentUser(c)) return c.redirect(next);
    const notice = c.req.query("wiederhergestellt") !== undefined ? "Die Sicherung wurde eingespielt. Melde dich mit einem Konto aus der Sicherung an." : undefined;
    return c.html(renderLogin({ next, notice }));
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
    return c.html(renderSetup({ token: token!, restore: backups !== undefined }));
  });

  // Moving to a new computer: a fresh Theta can start from a backup instead of a new account.
  app.post("/setup/restore", async (c) => {
    if (auth.hasUsers() || !backups) return c.redirect("/login");
    const form = await c.req.parseBody();
    if (!setupAllowed(form.token)) return c.html(renderSetupLocked(), 403);
    try {
      backups.restore(await backupFile(form.file));
    } catch (err) {
      if (err instanceof BackupError) return c.html(renderSetup({ token: String(form.token), restore: true, restoreError: err.message }), 400);
      throw err;
    }
    if (!auth.hasUsers()) return c.redirect("/setup");
    return c.redirect("/login?wiederhergestellt");
  });

  app.post("/setup", async (c) => {
    if (auth.hasUsers()) return c.redirect("/login");
    const form = await c.req.parseBody();
    if (!setupAllowed(form.token)) return c.html(renderSetupLocked(), 403);

    const input = { name: String(form.name ?? ""), email: String(form.email ?? ""), password: String(form.password ?? "") };
    const retry = (error: string) => c.html(renderSetup({ token: String(form.token), error, name: input.name, email: input.email, restore: backups !== undefined }), 400);
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

  const sharedData = () => pages.sharedSections().map((page) => ({ page, liveBlocks: pages.live(page.slug)?.blocks ?? null, usage: pages.sharedUsage(page.slug) }));
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
    return c.html(renderEditor({ page, site: settings.site(), nav: pages.nav(settings.site()), legal: pages.legal(settings.site()), pages: targets, templates: settings.templates(), sharedSections: sharedData(), layoutRules: settings.layoutRules(), posts: postSummaries(pages.posts()) }, themeCss(settings.theme())));
  };
  app.get("/edit", (c) => editor(c, HOME));
  app.get(`/edit/${HOME}`, (c) => c.redirect("/edit"));
  app.get("/edit/:slug", (c) => editor(c, c.req.param("slug")));

  const dashboard = (c: Context<Env>, error?: string) =>
    c.html(
      renderDashboard({
        user: c.get("user"),
        pages: pages.list(),
        site: settings.site(),
        media: media.list(),
        origin: siteContext(c).origin,
        error,
        unread: contact?.unread(),
        hasForm: hasLiveForm(c),
        redirects: pages.redirects.list(),
        backups: backups !== undefined,
      }),
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

  // A path is taken when a page or post (published or not) lives there.
  const pageAt = (path: string) => {
    if (path === `/${BLOG}`) return true;
    const [, first, second, extra] = path.split("/");
    const page = second === undefined ? pages.get(first!) : first === BLOG && extra === undefined ? pages.get(second) : null;
    return page !== null && page.kind === (second === undefined ? "page" : "post");
  };
  app.post("/admin/redirects", async (c) => {
    try {
      const form = await c.req.parseBody();
      pages.redirects.add({ from: form.from, to: form.to }, pageAt);
      return c.redirect("/admin#weiterleitungen", 303);
    } catch (err) {
      if (err instanceof ValidationError) return dashboard(c, err.message);
      throw err;
    }
  });
  app.post("/admin/redirects/delete", async (c) => {
    const form = await c.req.parseBody();
    pages.redirects.remove(String(form.from ?? ""));
    return c.redirect("/admin#weiterleitungen", 303);
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

  // Contact form inbox and optional e-mail copies

  const messagesPage = (c: Context<Env>, { error, notice }: { error?: string; notice?: string } = {}) => {
    if (!contact) return c.notFound();
    const mail = contact.mailSettings();
    const hasForm = hasLiveForm(c);
    return c.html(
      renderMessages({
        user: c.get("user"),
        messages: contact.list(),
        mail: mail && { host: mail.host, port: mail.port, security: mail.security, user: mail.user, from: mail.from, to: mail.to, hasPassword: mail.password !== "" },
        hasForm,
        error,
        notice,
      }),
      error ? 400 : 200,
    );
  };
  const messageId = (c: Context<Env>) => Number(c.req.param("id"));

  app.get("/admin/messages", (c) => messagesPage(c));
  app.post("/admin/messages/:id{[0-9]+}/read", async (c) => {
    const form = await c.req.parseBody();
    contact?.markRead(messageId(c), form.read !== "0");
    return c.redirect("/admin/messages", 303);
  });
  app.post("/admin/messages/:id{[0-9]+}/delete", (c) => {
    contact?.delete(messageId(c));
    return c.redirect("/admin/messages", 303);
  });
  app.post("/admin/messages/mail", async (c) => {
    if (!contact) return c.notFound();
    try {
      contact.saveMailSettings(await c.req.parseBody());
      return messagesPage(c, { notice: "Gespeichert. Sende eine Test-E-Mail, um die Einstellungen zu prüfen." });
    } catch (err) {
      if (err instanceof ValidationError) return messagesPage(c, { error: err.message });
      throw err;
    }
  });
  app.post("/admin/messages/mail/delete", (c) => {
    contact?.removeMailSettings();
    return messagesPage(c, { notice: "E-Mail-Benachrichtigung ausgeschaltet. Nachrichten landen weiter hier." });
  });
  app.post("/admin/messages/mail/test", async (c) => {
    if (!contact) return c.notFound();
    try {
      await contact.sendTest(settings.site());
      return messagesPage(c, { notice: `Test-E-Mail an ${contact.mailSettings()!.to} gesendet. Sieh in deinem Postfach nach, auch im Spam-Ordner.` });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return messagesPage(c, { error: `Die Test-E-Mail konnte nicht gesendet werden: ${reason}` });
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
    // The form shows as it will look; it sends to the live page.
    return page ? c.html(renderPage(page, siteContext(c), formSetup(c, pagePath(page)))) : c.notFound();
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

  app.get("/api/shared-sections", (c) => c.json(sharedData()));
  app.post("/api/shared-sections", bodyLimit({ maxSize: 2_000_000 }), async (c) => {
    const body = await c.req.json().catch(() => null);
    try {
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Ungültiger Abschnitt");
      const page = pages.createShared(body.title, body.blocks, c.get("user").name);
      return c.json({ page, liveBlocks: null, usage: [] }, 201);
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message, block: err.block }, 400);
      throw err;
    }
  });
  const sharedAdmin = (c: Context<Env>, error?: string) => c.html(renderSharedSections({ user: c.get("user"), sections: sharedData(), rules: settings.layoutRules(), error }), error ? 400 : 200);
  app.post("/admin/shared-sections/:slug/rule", async (c) => {
    const form = await c.req.parseBody();
    try {
      settings.saveLayoutRule(c.req.param("slug"), typeof form.place === "string" ? form.place : "");
      return c.redirect("/admin/shared-sections");
    } catch (err) {
      if (err instanceof ValidationError) return sharedAdmin(c, err.message);
      throw err;
    }
  });
  app.get("/admin/shared-sections", (c) => sharedAdmin(c));
  app.post("/admin/shared-sections", async (c) => {
    const form = await c.req.parseBody();
    try {
      const page = pages.createShared(form.title, [{ id: crypto.randomUUID(), type: "section", background: "accent", width: "wide" }, { id: crypto.randomUUID(), type: "heading", text: String(form.title ?? ""), level: 2 }, { id: crypto.randomUUID(), type: "text", text: "" }], c.get("user").name);
      return c.redirect(editPath(page.slug));
    } catch (err) {
      if (err instanceof ValidationError) return sharedAdmin(c, err.message);
      throw err;
    }
  });
  app.post("/admin/shared-sections/:slug/delete", async (c) => {
    const form = await c.req.parseBody();
    try {
      if (pages.get(c.req.param("slug"))?.kind !== "section") throw new ValidationError("Gemeinsamer Abschnitt nicht gefunden");
      pages.delete(c.req.param("slug"), parseVersion(Number(form.version)));
      return c.redirect("/admin/shared-sections");
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) return sharedAdmin(c, err.message);
      throw err;
    }
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

  // Sections copied on another Theta site bring their pictures along. Only addresses of a
  // Theta media library are accepted, and only files that really are pictures are kept.
  app.post("/api/media/import", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { url?: unknown } | null;
    const fail = (error: string) => c.json({ error }, 400);
    let url: URL;
    try {
      url = new URL(typeof body?.url === "string" ? body.url : "");
    } catch {
      return fail("Ungültige Bild-Adresse");
    }
    if (!/^https?:$/.test(url.protocol) || !/^\/media\/[\w-]+\/[\w.-]+$/.test(url.pathname) || url.username || url.password) {
      return fail("Nur Bilder aus der Mediathek einer anderen Theta-Website können übernommen werden.");
    }
    let bytes: ArrayBuffer;
    try {
      const response = await download(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) return fail(`Das Bild ${url.pathname.split("/").pop()} ist auf der anderen Website nicht mehr vorhanden.`);
      if (Number(response.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return fail("Das Bild ist größer als 20 MB.");
      bytes = await response.arrayBuffer();
    } catch {
      return fail("Die andere Website ist gerade nicht erreichbar.");
    }
    try {
      return c.json(await media.add(new File([bytes], url.pathname.split("/").pop()!)), 201);
    } catch (err) {
      if (err instanceof ValidationError) return fail(err.message);
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

  // A complete backup: database and uploaded images, to keep safe or to move the site.
  app.post("/admin/backup", (c) => {
    if (!backups) return c.notFound();
    return new Response(backups.create(), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${backupName(slugify(settings.site().name))}"`,
      },
    });
  });

  // Replaces the whole site with a backup. Sessions are not part of a backup, so everybody
  // signs in again, with the accounts from the backup.
  app.post("/admin/restore", async (c) => {
    if (!backups) return c.notFound();
    const form = await c.req.parseBody();
    if (form.confirm !== "ja") return dashboard(c, "Bitte bestätige, dass die Sicherung die aktuelle Website ersetzt.");
    try {
      backups.restore(await backupFile(form.file));
    } catch (err) {
      if (err instanceof BackupError) return dashboard(c, err.message);
      throw err;
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect(auth.hasUsers() ? "/login?wiederhergestellt" : "/setup");
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

  // Address search for the map block in the editor.
  app.get("/api/geocode", async (c) => {
    const query = (c.req.query("q") ?? "").trim();
    if (query.length < 3 || query.length > 200) return c.json({ error: "Bitte eine Adresse mit mindestens drei Zeichen eingeben" }, 400);
    try {
      return c.json(await geocoder(query, settings.site().language ?? "de"));
    } catch (err) {
      console.error("Ortssuche fehlgeschlagen:", err instanceof Error ? err.message : err);
      return c.json({ error: "Die Suche bei OpenStreetMap hat gerade nicht geklappt. Du kannst stattdessen einen Kartenlink einfügen." }, 502);
    }
  });

  // A new address for a page or post. The old one keeps working as a redirect once the page is public.
  app.post("/api/pages/:slug/address", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Ungültiges JSON" }, 400);
    try {
      return c.json(pages.changeSlug(c.req.param("slug"), body.slug, parseVersion(body.version)));
    } catch (err) {
      if (err instanceof ConflictError) return c.json({ error: err.message, conflict: true }, 409);
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
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
    return page?.kind === "page" ? showPage(c, page) : missing(c);
  });
  app.post("/:slug{[a-z0-9-]+}", (c) => {
    const page = pages.live(c.req.param("slug"));
    return receiveMessage(c, page?.kind === "page" ? page : null);
  });

  app.notFound((c) => missing(c));

  return app;
}

async function backupFile(value: unknown): Promise<Uint8Array> {
  if (!(value instanceof File) || value.size === 0) throw new BackupError("Bitte eine Sicherungsdatei (.zip) auswählen.");
  return new Uint8Array(await value.arrayBuffer());
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

// Starts Theta with the settings from the environment. Returns the address to open first:
// the setup link while there is no account, otherwise the admin.
export function startServer(): URL {
  const dbPath = process.env.THETA_DB ?? "theta.db";
  const db = openDatabase(dbPath);
  const uploads = process.env.THETA_UPLOADS ?? join(dirname(dbPath), "uploads");
  const media = new MediaStore(db, uploads);
  const auth = new AuthStore(db);
  const backups = new Backups(db, uploads, join(dirname(dbPath), "sicherungen"));
  const publicUrl = process.env.THETA_URL;
  const setupToken = auth.hasUsers() ? undefined : Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");

  const server = Bun.serve({
    hostname: process.env.THETA_HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
    maxRequestBodySize: MAX_BACKUP_BYTES,
    fetch: createApp({ pages: new PageStore(db), settings: new SettingsStore(db), media, auth, setupToken, publicUrl, contact: new ContactStore(db), backups }).fetch,
  });

  // Listening on all addresses (e.g. in Docker), the server's own address is 0.0.0.0, which
  // browsers cannot open; localhost reaches it from the same computer.
  const base = publicUrl ?? server.url.href.replace("//0.0.0.0", "//localhost");
  console.log(`Theta läuft auf ${base}`);
  if (setupToken) {
    const setup = new URL(`/setup?token=${setupToken}`, base);
    console.log(`\nNoch kein Konto vorhanden. Richte Theta hier ein:\n${setup}\n`);
    return setup;
  }
  const admin = new URL("/admin", base);
  console.log(`Verwalten: ${admin}`);
  return admin;
}

if (import.meta.main) startServer();
