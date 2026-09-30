import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Page } from "./blocks";
import { BlockView } from "./theme/blocks";

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

// Public page: plain HTML and CSS, no JavaScript at all.
export function renderPage(page: Page): string {
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Document title={page.title}>
        <main className="t-page">
          {page.blocks.map((block) => (
            <BlockView key={block.id} block={block} />
          ))}
        </main>
      </Document>,
    )
  );
}

// Editor page: the same theme, plus the editor script that makes it editable in place.
export function renderEditor(page: Page): string {
  // Escape "<" so page content can never close the script tag early.
  const data = JSON.stringify(page).replace(/</g, "\\u003c");
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Document
        title={`${page.title} bearbeiten`}
        head={
          <>
            <link rel="stylesheet" href="/assets/editor.css" />
            <script type="module" src="/assets/editor.js" />
          </>
        }
      >
        <div id="theta-editor" />
        <script id="theta-page" type="application/json" dangerouslySetInnerHTML={{ __html: data }} />
      </Document>,
    )
  );
}
