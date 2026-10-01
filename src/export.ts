import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { assetFile } from "./assets";
import { BLOG, HOME } from "./blocks";
import { builtinMedia, type MediaStore } from "./media";
import { type SiteContext, postSummaries, renderBlogIndex, renderFeed, renderNotFound, renderPage, renderRobots, renderSitemap } from "./render";
import type { Redirect } from "./redirects";
import type { PageStore, SettingsStore } from "./store";
import { FONTS, fontFiles, themeCss } from "./theme/tokens";

// Turns the whole site into plain files that any web host can serve, with or without
// Theta. Public pages contain no JavaScript, so they work exactly as they do live.

type Stores = { pages: PageStore; settings: SettingsStore; media: MediaStore };

export async function exportSite({ pages, settings, media }: Stores, origin: string): Promise<Map<string, Uint8Array>> {
  const encoder = new TextEncoder();
  const files = new Map<string, Uint8Array>();
  const all = pages.publishedPages();
  const posts = pages.posts();
  const context: SiteContext = {
    site: settings.site(),
    nav: pages.nav(settings.site()),
    legal: pages.legal(settings.site()),
    origin,
    images: (src) => media.info(src),
    themeCss: themeCss(settings.theme()),
    sharedSections: Object.fromEntries(pages.sharedSections().flatMap((section) => {
      const live = pages.live(section.slug);
      return live ? [[section.slug, live.blocks]] : [];
    })),
    layoutRules: settings.layoutRules(),
    posts: postSummaries(posts),
  };

  for (const page of all) {
    files.set(page.slug === HOME ? "index.html" : `${page.slug}/index.html`, encoder.encode(renderPage(page, context)));
  }
  if (posts.length > 0) {
    for (const post of posts) files.set(`${BLOG}/${post.slug}/index.html`, encoder.encode(renderPage(post, context)));
    files.set(`${BLOG}/index.html`, encoder.encode(renderBlogIndex(posts, context)));
    files.set(`${BLOG}/feed.xml`, encoder.encode(renderFeed(posts, context.site, origin)));
  }
  files.set("404.html", encoder.encode(renderNotFound(context)));
  files.set("sitemap.xml", encoder.encode(renderSitemap([...all, ...posts], origin)));
  files.set("robots.txt", encoder.encode(renderRobots(origin)));
  files.set("assets/theme.css", await assetFile("src/theme/theme.css").bytes());
  for (const font of FONTS[settings.theme().fonts].web) {
    for (const name of fontFiles(font)) files.set(`assets/fonts/${name}`, await assetFile(`src/theme/fonts/${name}`).bytes());
    if (font === "atkinson") files.set("licenses/atkinson-OFL.txt", await assetFile("src/theme/fonts/atkinson-LICENSE.txt").bytes());
  }

  // Copy exactly the images the pages refer to, including their smaller versions.
  const html = new TextDecoder().decode(Buffer.concat([...files.values()]));
  for (const [url] of html.matchAll(/\/media\/[\w.-]+(?:\/[\w.-]+)?/g)) {
    const [, first, second] = url.split("/").slice(1);
    const path = second ? media.path(first!, second) : builtinMedia(first!);
    if (path && !files.has(url.slice(1))) files.set(url.slice(1), await Bun.file(path).bytes());
  }
  addRedirects(files, pages.redirects.list(), origin);
  return files;
}

// Static hosts cannot answer with a real redirect by themselves. Many (Netlify, Cloudflare Pages)
// read a _redirects file; everywhere else a small page at the old address forwards the visitor.
function addRedirects(files: Map<string, Uint8Array>, redirects: Redirect[], origin: string) {
  if (redirects.length === 0) return;
  const encoder = new TextEncoder();
  files.set("_redirects", encoder.encode(redirects.map(({ from, to }) => `${from} ${to} 301`).join("\n") + "\n"));
  for (const { from, to } of redirects) {
    let path: string;
    try {
      path = decodeURIComponent(from.slice(1));
    } catch {
      continue;
    }
    if (path.split("/").some((part) => part === "" || part === "." || part === "..")) continue;
    const file = /\.html?$/.test(path) ? path : `${path}/index.html`;
    if (files.has(file)) continue;
    const target = escapeHtml(new URL(to, origin).href);
    files.set(
      file,
      encoder.encode(
        `<!doctype html><html><head><meta charset="utf-8"><title>Weitergeleitet</title><meta name="robots" content="noindex">` +
          `<link rel="canonical" href="${target}"><meta http-equiv="refresh" content="0; url=${target}"></head>` +
          `<body><p><a href="${target}">${target}</a></p></body></html>\n`,
      ),
    );
  }
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function writeFiles(files: Map<string, Uint8Array>, dir: string) {
  for (const [path, data] of files) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    await Bun.write(target, data);
  }
}
