import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { BLOG, HOME } from "./blocks";
import { builtinMedia, type MediaStore } from "./media";
import { type SiteContext, renderBlogIndex, renderFeed, renderNotFound, renderPage, renderRobots, renderSitemap } from "./render";
import type { PageStore, SettingsStore } from "./store";
import { FONTS, fontFiles, themeCss } from "./theme/tokens";

// Turns the whole site into plain files that any web host can serve, with or without
// Theta. Public pages contain no JavaScript, so they work exactly as they do live.

type Stores = { pages: PageStore; settings: SettingsStore; media: MediaStore };

export async function exportSite({ pages, settings, media }: Stores, origin: string): Promise<Map<string, Uint8Array>> {
  const encoder = new TextEncoder();
  const files = new Map<string, Uint8Array>();
  const all = pages.list();
  const posts = pages.posts();
  const context: SiteContext = {
    site: settings.site(),
    nav: pages.nav(settings.site()),
    legal: pages.legal(settings.site()),
    origin,
    images: (src) => media.info(src),
    themeCss: themeCss(settings.theme()),
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
  files.set("assets/theme.css", await Bun.file(new URL("./theme/theme.css", import.meta.url)).bytes());
  for (const font of FONTS[settings.theme().fonts].web) {
    for (const name of fontFiles(font)) files.set(`assets/fonts/${name}`, await Bun.file(new URL(`./theme/fonts/${name}`, import.meta.url)).bytes());
  }

  // Copy exactly the images the pages refer to, including their smaller versions.
  const html = new TextDecoder().decode(Buffer.concat([...files.values()]));
  for (const [url] of html.matchAll(/\/media\/[\w.-]+(?:\/[\w.-]+)?/g)) {
    const [, first, second] = url.split("/").slice(1);
    const path = second ? media.path(first!, second) : builtinMedia(first!);
    if (path && !files.has(url.slice(1))) files.set(url.slice(1), await Bun.file(path).bytes());
  }
  return files;
}

export async function writeFiles(files: Map<string, Uint8Array>, dir: string) {
  for (const [path, data] of files) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    await Bun.write(target, data);
  }
}
