import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { User } from "../auth";
import { HOME, type Page, type SiteSettings, editPath, publicPath } from "../blocks";
import type { MediaItem } from "../media";

// Server-rendered admin screens. They work without JavaScript: plain forms that post back.

function AdminHead({ title }: { title: string }) {
  return (
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{`${title} · Theta`}</title>
      <link rel="icon" href="/media/favicon.svg" type="image/svg+xml" />
      <link rel="stylesheet" href="/assets/admin.css" />
    </head>
  );
}

function AdminDocument({ title, children }: { title: string; children: ReactNode }) {
  return (
    <html lang="de">
      <AdminHead title={title} />
      <body className="a-centered">
        <main className="a-card">
          <p className="a-logo">θ Theta</p>
          <h1>{title}</h1>
          {children}
        </main>
      </body>
    </html>
  );
}

function ErrorMessage({ error }: { error?: string }) {
  return error ? (
    <p className="a-error" role="alert">
      {error}
    </p>
  ) : null;
}

const html = (node: ReactNode) => "<!doctype html>" + renderToStaticMarkup(node);

export function renderLogin({ error, email = "", next = "/admin" }: { error?: string; email?: string; next?: string }) {
  return html(
    <AdminDocument title="Anmelden">
      <ErrorMessage error={error} />
      <form method="post" action="/login" className="a-form">
        <input type="hidden" name="next" value={next} />
        <label>
          E-Mail
          <input name="email" type="email" autoComplete="username" required defaultValue={email} autoFocus />
        </label>
        <label>
          Passwort
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">Anmelden</button>
      </form>
    </AdminDocument>,
  );
}

export function renderSetup({ token, error, name = "", email = "" }: { token: string; error?: string; name?: string; email?: string }) {
  return html(
    <AdminDocument title="Theta einrichten">
      <p>Lege das Konto an, mit dem du deine Website bearbeitest.</p>
      <ErrorMessage error={error} />
      <form method="post" action="/setup" className="a-form">
        <input type="hidden" name="token" value={token} />
        <label>
          Name
          <input name="name" autoComplete="name" required defaultValue={name} autoFocus />
        </label>
        <label>
          E-Mail
          <input name="email" type="email" autoComplete="username" required defaultValue={email} />
        </label>
        <label>
          Passwort (mindestens 10 Zeichen)
          <input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <label>
          Passwort wiederholen
          <input name="password2" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <button type="submit">Konto anlegen</button>
      </form>
    </AdminDocument>,
  );
}

export function renderSetupLocked() {
  return html(
    <AdminDocument title="Theta einrichten">
      <p>
        Öffne den Einrichtungs-Link, den Theta beim Start im Terminal anzeigt. So kann niemand anderes dein Konto
        anlegen.
      </p>
    </AdminDocument>,
  );
}

function AdminBar({ user, current }: { user: User; current: "pages" | "media" }) {
  return (
    <header className="a-bar">
      <strong>θ Theta</strong>
      <nav className="a-tabs" aria-label="Verwaltung">
        <a href="/admin" aria-current={current === "pages" ? "page" : undefined}>
          Seiten
        </a>
        <a href="/admin/media" aria-current={current === "media" ? "page" : undefined}>
          Mediathek
        </a>
      </nav>
      <a href="/" target="_blank" rel="noopener">
        Website ansehen
      </a>
      <span className="a-muted">{user.name}</span>
      <form method="post" action="/logout">
        <button className="a-link">Abmelden</button>
      </form>
    </header>
  );
}

type DashboardProps = { user: User; pages: Page[]; site: SiteSettings; error?: string };

export function renderDashboard({ user, pages, site, error }: DashboardProps) {
  const movable = pages.filter((page) => page.slug !== HOME);
  return html(
    <html lang="de">
      <AdminHead title="Übersicht" />
      <body>
        <AdminBar user={user} current="pages" />

        <main className="a-main">
          <ErrorMessage error={error} />

          <section className="a-section">
            <h2>Seiten</h2>
            <ul className="a-list">
              {pages.map((page) => {
                const index = movable.indexOf(page);
                return (
                  <li key={page.slug}>
                    <div className="a-grow">
                      <a href={editPath(page.slug)} className="a-title">
                        {page.title}
                      </a>
                      <span className="a-muted">
                        {publicPath(page.slug)}
                        {page.slug === HOME ? " · Startseite" : page.inNav ? " · im Menü" : " · nicht im Menü"}
                      </span>
                    </div>
                    {page.slug !== HOME && (
                      <>
                        <form method="post" action={`/admin/pages/${page.slug}/move`}>
                          <button name="direction" value="up" disabled={index === 0} aria-label={`${page.title} nach oben`}>
                            ↑
                          </button>
                          <button
                            name="direction"
                            value="down"
                            disabled={index === movable.length - 1}
                            aria-label={`${page.title} nach unten`}
                          >
                            ↓
                          </button>
                        </form>
                        <details className="a-delete">
                          <summary>Löschen</summary>
                          <form method="post" action={`/admin/pages/${page.slug}/delete`}>
                            <button className="a-danger">„{page.title}“ endgültig löschen</button>
                          </form>
                        </details>
                      </>
                    )}
                    <a className="a-button" href={editPath(page.slug)}>
                      Bearbeiten
                    </a>
                  </li>
                );
              })}
            </ul>
            <form method="post" action="/admin/pages" className="a-inline">
              <input name="title" placeholder="Titel der neuen Seite, z. B. Über uns" required maxLength={200} aria-label="Titel der neuen Seite" />
              <button className="a-primary">Seite anlegen</button>
            </form>
          </section>

          <section className="a-section">
            <h2>Website</h2>
            <form method="post" action="/admin/site" className="a-form">
              <label>
                Name der Website
                <input name="name" required maxLength={100} defaultValue={site.name} />
              </label>
              <label>
                Kurzbeschreibung für Suchmaschinen
                <textarea name="description" maxLength={300} rows={2} defaultValue={site.description} />
              </label>
              <button className="a-primary">Speichern</button>
            </form>
          </section>
        </main>
      </body>
    </html>,
  );
}

type MediaLibraryProps = { user: User; items: MediaItem[]; usage: Map<string, string[]>; error?: string };

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export function renderMediaLibrary({ user, items, usage, error }: MediaLibraryProps) {
  return html(
    <html lang="de">
      <AdminHead title="Mediathek" />
      <body>
        <AdminBar user={user} current="media" />
        <main className="a-main">
          <ErrorMessage error={error} />
          <section className="a-section">
            <h2>Bilder hochladen</h2>
            <form method="post" action="/admin/media" encType="multipart/form-data" className="a-inline">
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple required />
              <button className="a-primary">Hochladen</button>
            </form>
            <p className="a-muted">
              JPG, PNG, WebP, AVIF oder GIF bis 20 MB. Theta dreht Fotos richtig herum, entfernt Standortdaten und erzeugt
              kleinere Versionen für schnelle Ladezeiten.
            </p>
          </section>

          <section className="a-section">
            <h2>Mediathek</h2>
            {items.length === 0 ? (
              <p className="a-muted">Noch keine Bilder hochgeladen.</p>
            ) : (
              <ul className="a-media">
                {items.map((item) => {
                  const usedOn = usage.get(item.id) ?? [];
                  return (
                    <li key={item.id}>
                      <a href={item.url} target="_blank" rel="noopener">
                        <img src={item.thumb} alt="" loading="lazy" />
                      </a>
                      <span className="a-title" title={item.filename}>
                        {item.filename}
                      </span>
                      <span className="a-muted">
                        {item.width} × {item.height} · {formatSize(item.size)}
                      </span>
                      <input className="a-copy" readOnly value={item.url} aria-label={`Adresse von ${item.filename}`} />
                      {usedOn.length > 0 && <span className="a-muted">Verwendet auf: {usedOn.join(", ")}</span>}
                      <details className="a-delete">
                        <summary>Löschen</summary>
                        <form method="post" action={`/admin/media/${item.id}/delete`}>
                          <button className="a-danger">
                            {usedOn.length > 0 ? "Trotzdem löschen, das Bild verschwindet von den Seiten" : "Endgültig löschen"}
                          </button>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>
      </body>
    </html>,
  );
}
