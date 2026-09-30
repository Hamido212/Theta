import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BLOG, HOME, type NavItem, type Page, type SiteSettings, excerpt, formatDate, pagePath, publicPath } from "./blocks";
import { BlockFlow, BlockView } from "./theme/blocks";
import { type ImageLookup, Img, ImageLookupContext } from "./theme/image";
import { SiteFrame } from "./theme/layout";

// What every page needs to know about the site around it.
export type SiteContext = {
  site: SiteSettings;
  nav: NavItem[];
  // Absolute base address, e.g. https://example.com, for canonical links and the sitemap.
  origin: string;
  // Size and smaller copies of uploaded images.
  images?: ImageLookup;
  // The site's design tokens as CSS (see src/theme/tokens.ts).
  themeCss?: string;
};

// Data the browser editor starts with.
export type EditorData = {
  page: Page;
  site: SiteSettings;
  nav: NavItem[];
  // All pages, offered as link targets.
  pages: NavItem[];
};

type DocumentProps = { title: string; themeCss?: string; head?: ReactNode; children: ReactNode };

function Document({ title, themeCss, head, children }: DocumentProps) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" href="/media/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/assets/theme.css" />
        {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
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

// The first picture on a page, used for link previews and as a post's cover in the blog.
function coverImage(page: Page): { src: string; alt: string } | undefined {
  for (const block of page.blocks) {
    if ((block.type === "image" || block.type === "hero") && block.src) return block;
    if (block.type === "gallery" && block.images[0]?.src) return block.images[0];
  }
}

// Tags for search engines and link previews (Open Graph).
function SeoTags({ page, site, origin }: { page: Page; site: SiteSettings; origin: string }) {
  const url = new URL(pagePath(page), origin).href;
  const description = page.description || site.description;
  const image = coverImage(page);
  const imageUrl = image ? new URL(image.src, origin).href : undefined;
  const post = page.kind === "post";
  return (
    <>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      <meta property="og:type" content={post ? "article" : "website"} />
      <meta property="og:site_name" content={site.name} />
      <meta property="og:title" content={page.title} />
      <meta property="og:url" content={url} />
      {description && <meta property="og:description" content={description} />}
      {imageUrl && <meta property="og:image" content={imageUrl} />}
      {post && page.publishedAt && <meta property="article:published_time" content={page.publishedAt} />}
      <meta name="twitter:card" content={imageUrl ? "summary_large_image" : "summary"} />
    </>
  );
}

// Lets feed readers find the blog from any page, once there is one.
function FeedLink({ site, nav }: { site: SiteSettings; nav: NavItem[] }) {
  if (!nav.some((item) => item.slug === BLOG)) return null;
  return <link rel="alternate" type="application/rss+xml" title={site.name} href={`/${BLOG}/feed.xml`} />;
}

function PostDate({ page }: { page: Page }) {
  if (!page.publishedAt) return null;
  return (
    <p className="t-post-meta">
      <time dateTime={page.publishedAt}>{formatDate(page.publishedAt)}</time>
    </p>
  );
}

// Public page: plain HTML and CSS, no JavaScript at all.
export function renderPage(page: Page, { site, nav, origin, images = () => null, themeCss }: SiteContext): string {
  const post = page.kind === "post";
  return html(
    <Document
      title={pageTitle(page, site)}
      themeCss={themeCss}
      head={
        <>
          <SeoTags page={page} site={site} origin={origin} />
          <FeedLink site={site} nav={nav} />
        </>
      }
    >
      <ImageLookupContext.Provider value={images}>
        <SiteFrame site={site} nav={nav} current={post ? BLOG : page.slug} linkTo={publicPath}>
          {post && <PostDate page={page} />}
          <BlockFlow blocks={page.blocks}>{(block) => <BlockView key={block.id} block={block} />}</BlockFlow>
          {post && (
            <p className="t-post-back">
              <a href={`/${BLOG}`}>← Alle Beiträge</a>
            </p>
          )}
        </SiteFrame>
      </ImageLookupContext.Provider>
    </Document>,
  );
}

// The blog's front page: every published post, newest first.
export function renderBlogIndex(posts: Page[], { site, nav, origin, images = () => null, themeCss }: SiteContext): string {
  const url = new URL(`/${BLOG}`, origin).href;
  return html(
    <Document
      title={`Blog · ${site.name}`}
      themeCss={themeCss}
      head={
        <>
          <link rel="canonical" href={url} />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content={site.name} />
          <meta property="og:title" content={`Blog · ${site.name}`} />
          <meta property="og:url" content={url} />
          <FeedLink site={site} nav={nav} />
        </>
      }
    >
      <ImageLookupContext.Provider value={images}>
        <SiteFrame site={site} nav={nav} current={BLOG} linkTo={publicPath}>
          <h1 className="t-heading t-heading-1">Blog</h1>
          {posts.length === 0 ? (
            <div className="t-text">
              <p>Hier erscheinen bald die ersten Beiträge.</p>
            </div>
          ) : (
            <ul className="t-posts">
              {posts.map((post) => {
                const cover = coverImage(post);
                const teaser = excerpt(post);
                return (
                  <li key={post.slug} className="t-post-card">
                    {cover && <Img src={cover.src} alt={cover.alt} sizes="(min-width: 44rem) 42rem, 100vw" />}
                    <PostDate page={post} />
                    <h2 className="t-post-title">
                      <a href={pagePath(post)}>{post.title}</a>
                    </h2>
                    {teaser && <p className="t-post-teaser">{teaser}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </SiteFrame>
      </ImageLookupContext.Provider>
    </Document>,
  );
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// RSS 2.0, so readers can follow the blog in a feed reader.
export function renderFeed(posts: Page[], site: SiteSettings, origin: string): string {
  const link = (path: string) => escapeXml(new URL(path, origin).href);
  const items = posts
    .slice(0, 20)
    .map((post) =>
      [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${link(pagePath(post))}</link>`,
        `      <guid isPermaLink="true">${link(pagePath(post))}</guid>`,
        post.publishedAt ? `      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>` : "",
        `      <description>${escapeXml(excerpt(post))}</description>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)}</title>
    <link>${link(`/${BLOG}`)}</link>
    <description>${escapeXml(site.description || `Neue Beiträge von ${site.name}`)}</description>
    <language>de</language>
    <atom:link href="${link(`/${BLOG}/feed.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

export function renderNotFound({ site, nav, themeCss }: SiteContext): string {
  return html(
    <Document title={`Seite nicht gefunden · ${site.name}`} themeCss={themeCss} head={<meta name="robots" content="noindex" />}>
      <SiteFrame site={site} nav={nav} current="" linkTo={publicPath}>
        <h1 className="t-heading t-heading-1">Seite nicht gefunden</h1>
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
export function renderEditor(data: EditorData, themeCss?: string): string {
  // Escape "<" so page content can never close the script tag early.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return html(
    <Document
      title={`${data.page.title} bearbeiten`}
      themeCss={themeCss}
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

// Pages and published posts; the blog's front page is listed when there are posts.
export function renderSitemap(pages: Page[], origin: string): string {
  const entries = pages.map((page) => ({ path: pagePath(page), updatedAt: page.updatedAt }));
  const posts = pages.filter((page) => page.kind === "post");
  if (posts.length > 0) {
    entries.push({ path: `/${BLOG}`, updatedAt: posts.map((post) => post.updatedAt).sort().at(-1)! });
  }
  const urls = entries
    .map(
      ({ path, updatedAt }) =>
        `  <url><loc>${escapeXml(new URL(path, origin).href)}</loc><lastmod>${updatedAt.slice(0, 10)}</lastmod></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(origin: string): string {
  return `User-agent: *\nDisallow: /admin\nDisallow: /edit\nDisallow: /api/\n\nSitemap: ${new URL("/sitemap.xml", origin).href}\n`;
}
