import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HOME, type NavItem, type Page, type SiteSettings, publicPath } from "./blocks";
import { BlockView } from "./theme/blocks";
import { SiteFrame } from "./theme/layout";

// What every page needs to know about the site around it.
export type SiteContext = {
  site: SiteSettings;
  nav: NavItem[];
  // Absolute base address, e.g. https://example.com, for canonical links and the sitemap.
  origin: string;
};

// Data the browser editor starts with.
export type EditorData = { page: Page; site: SiteSettings; nav: NavItem[] };

function Document({ title, head, children }: { title: string; head?: ReactNode; children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" href="/media/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/assets/theme.css" />
        {head}
      </head>
      <body>{children}</body>
    </html>
  );
}

const html = (node: ReactNode) => "<!doctype html>" + renderToStaticMarkup(node);

export function pageTitle(page: Page, site: SiteSettings) {
  return page.slug === HOME ? site.name : `${page.title} · ${site.name}`;
}

// Tags for search engines and link previews (Open Graph).
function SeoTags({ page, site, origin }: { page: Page; site: SiteSettings; origin: string }) {
  const url = new URL(publicPath(page.slug), origin).href;
  const description = page.description || site.description;
  const image = page.blocks.find((block) => block.type === "image" && block.src);
  const imageUrl = image?.type === "image" ? new URL(image.src, origin).href : undefined;
  return (
    <>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={site.name} />
      <meta property="og:title" content={page.title} />
      <meta property="og:url" content={url} />
      {description && <meta property="og:description" content={description} />}
      {imageUrl && <meta property="og:image" content={imageUrl} />}
      <meta name="twitter:card" content={imageUrl ? "summary_large_image" : "summary"} />
    </>
  );
}

// Public page: plain HTML and CSS, no JavaScript at all.
export function renderPage(page: Page, { site, nav, origin }: SiteContext): string {
  return html(
    <Document title={pageTitle(page, site)} head={<SeoTags page={page} site={site} origin={origin} />}>
      <SiteFrame site={site} nav={nav} current={page.slug} linkTo={publicPath}>
        {page.blocks.map((block) => (
          <BlockView key={block.id} block={block} />
        ))}
      </SiteFrame>
    </Document>,
  );
}

export function renderNotFound({ site, nav }: SiteContext): string {
  return html(
    <Document title={`Seite nicht gefunden · ${site.name}`} head={<meta name="robots" content="noindex" />}>
      <SiteFrame site={site} nav={nav} current="" linkTo={publicPath}>
        <h1 className="t-heading">Seite nicht gefunden</h1>
        <div className="t-text">
          <p>
            Diese Seite gibt es nicht (mehr). <a href="/">Zur Startseite</a>
          </p>
        </div>
      </SiteFrame>
    </Document>,
  );
}

// Editor page: the same theme, plus the editor script that makes it editable in place.
export function renderEditor(data: EditorData): string {
  // Escape "<" so page content can never close the script tag early.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return html(
    <Document
      title={`${data.page.title} bearbeiten`}
      head={
        <>
          <meta name="robots" content="noindex" />
          <link rel="stylesheet" href="/assets/editor.css" />
          <script type="module" src="/assets/editor.js" />
        </>
      }
    >
      <div id="theta-editor" />
      <script id="theta-page" type="application/json" dangerouslySetInnerHTML={{ __html: json }} />
    </Document>,
  );
}

export function renderSitemap(pages: Page[], origin: string): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = pages
    .map(
      (page) =>
        `  <url><loc>${escape(new URL(publicPath(page.slug), origin).href)}</loc><lastmod>${page.updatedAt.slice(0, 10)}</lastmod></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(origin: string): string {
  return `User-agent: *\nDisallow: /admin\nDisallow: /edit\nDisallow: /api/\n\nSitemap: ${new URL("/sitemap.xml", origin).href}\n`;
}
