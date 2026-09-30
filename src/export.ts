import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME } from "./blocks";
import { builtinMedia, type MediaStore } from "./media";
import { type SiteContext, renderNotFound, renderPage, renderRobots, renderSitemap } from "./render";
import type { PageStore, SettingsStore } from "./store";
import { themeCss } from "./theme/tokens";

// Turns the whole site into plain files that any web host can serve, with or without
// Theta. Public pages contain no JavaScript, so they work exactly as they do live.

type Stores = { pages: PageStore; settings: SettingsStore; media: MediaStore };

export async function exportSite({ pages, settings, media }: Stores, origin: string): Promise<Map<string, Uint8Array>> {
  const encoder = new TextEncoder();
  const files = new Map<string, Uint8Array>();
  const all = pages.list();
  const context: SiteContext = {
    site: settings.site(),
    nav: pages.nav(),
    origin,
    images: (src) => media.info(src),
    themeCss: themeCss(settings.theme()),
  };

  for (const page of all) {
    files.set(page.slug === HOME ? "index.html" : `${page.slug}/index.html`, encoder.encode(renderPage(page, context)));
  }
  files.set("404.html", encoder.encode(renderNotFound(context)));
  files.set("sitemap.xml", encoder.encode(renderSitemap(all, origin)));
  files.set("robots.txt", encoder.encode(renderRobots(origin)));
  files.set("assets/theme.css", await Bun.file(new URL("./theme/theme.css", import.meta.url)).bytes());

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
