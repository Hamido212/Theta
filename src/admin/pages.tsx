import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { User } from "../auth";
import { HOME, type Page, type SiteSettings, editPath, formatDate, pagePath, publicPath } from "../blocks";
import type { MediaItem } from "../media";
import { FONTS, PRESETS, type PresetId, RADIUS, SCHEMES, SPACING, type ThemeSettings, WIDTH, accentWarnings } from "../theme/tokens";
import { pageTemplates } from "../templates";

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
          <p className="a-logo-choice">θ Theta</p>
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

function AdminBar({ user, current }: { user: User; current: "pages" | "blog" | "media" | "design" }) {
  return (
    <header className="a-bar">
      <strong>θ Theta</strong>
      <nav className="a-tabs" aria-label="Verwaltung">
        <a href="/admin" aria-current={current === "pages" ? "page" : undefined}>
          Seiten
        </a>
        <a href="/admin/blog" aria-current={current === "blog" ? "page" : undefined}>
          Blog
        </a>
        <a href="/admin/media" aria-current={current === "media" ? "page" : undefined}>
          Mediathek
        </a>
        <a href="/admin/design" aria-current={current === "design" ? "page" : undefined}>
          Design
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

type DashboardProps = { user: User; pages: Page[]; site: SiteSettings; media: MediaItem[]; origin: string; error?: string };

function PageChoice({ name, label, value, pages }: { name: string; label: string; value: string; pages: Page[] }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        <option value="">Keine</option>
        {pages
          .filter((page) => page.slug !== HOME)
          .map((page) => (
            <option key={page.slug} value={page.slug}>
              {page.title}
            </option>
          ))}
      </select>
    </label>
  );
}

export function renderDashboard({ user, pages, site, media, origin, error }: DashboardProps) {
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
                        {page.slug === HOME
                          ? " · Startseite"
                          : page.slug === site.imprint || page.slug === site.privacy
                            ? " · in der Fußzeile"
                            : page.inNav
                              ? " · im Menü"
                              : " · nicht im Menü"}
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
              <select name="template" aria-label="Vorlage" defaultValue="blank">
                {pageTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.id === "blank" ? "Leere Seite" : `Vorlage: ${template.label}`}
                  </option>
                ))}
              </select>
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
              <fieldset className="a-logos">
                <legend>Logo (erscheint oben statt des Namens und als Symbol im Browser-Tab)</legend>
                <label className="a-logo-choice">
                  <input type="radio" name="logo" value="" defaultChecked={site.logo === ""} />
                  <span>Kein Logo, Name als Text</span>
                </label>
                {media.map((item) => (
                  <label key={item.id} className="a-logo-choice">
                    <input type="radio" name="logo" value={item.url} defaultChecked={site.logo === item.url} />
                    <img src={item.thumb} alt={item.filename} />
                  </label>
                ))}
                {media.length === 0 && (
                  <p className="a-muted">
                    Lade dein Logo zuerst in der <a href="/admin/media">Mediathek</a> hoch.
                  </p>
                )}
              </fieldset>
              <label>
                Fußzeile
                <textarea
                  name="footer"
                  maxLength={2000}
                  rows={4}
                  defaultValue={site.footer}
                  placeholder={"Zum Beispiel Adresse, Öffnungszeiten und Links:\nKarl-Heine-Straße 1, 04229 Leipzig\n[Instagram](https://instagram.com/…)"}
                />
                <small className="a-muted">**fett**, *kursiv* und [Linktext](https://…) sind möglich.</small>
              </label>
              <div className="a-pair">
                <PageChoice name="imprint" label="Impressum" value={site.imprint} pages={pages} />
                <PageChoice name="privacy" label="Datenschutzerklärung" value={site.privacy} pages={pages} />
              </div>
              {!site.imprint && (
                <p className="a-warning">
                  Geschäftliche Websites brauchen in Deutschland ein Impressum. Lege dafür eine Seite an und wähle sie hier aus;
                  sie erscheint dann unten auf jeder Seite. Im Hauptmenü muss sie nicht stehen.
                </p>
              )}
              <button className="a-primary">Speichern</button>
            </form>
          </section>

          <section className="a-section">
            <h2>Exportieren</h2>
            <p className="a-muted">
              Lade deine ganze Website als ZIP mit fertigen HTML-Dateien herunter. Du kannst sie bei jedem Webhoster hochladen,
              auch ohne Theta. So gehört deine Website immer dir.
            </p>
            <form method="post" action="/admin/export" className="a-inline">
              <input name="url" type="url" required defaultValue={origin} aria-label="Adresse, unter der die Website erreichbar sein wird" />
              <button className="a-primary">ZIP herunterladen</button>
            </form>
            <p className="a-muted">Die Adresse wird für Suchmaschinen und Link-Vorschauen gebraucht.</p>
          </section>
        </main>
      </body>
    </html>,
  );
}

type BlogProps = { user: User; posts: Page[]; error?: string };

export function renderBlog({ user, posts, error }: BlogProps) {
  return html(
    <html lang="de">
      <AdminHead title="Blog" />
      <body>
        <AdminBar user={user} current="blog" />

        <main className="a-main">
          <ErrorMessage error={error} />

          <section className="a-section">
            <h2>Beiträge</h2>
            {posts.length === 0 ? (
              <p className="a-muted">
                Noch keine Beiträge. Ein neuer Beitrag bleibt ein Entwurf, bis du ihn veröffentlichst. Sobald einer
                veröffentlicht ist, erscheint „Blog“ im Menü deiner Website.
              </p>
            ) : (
              <ul className="a-list">
                {posts.map((post) => (
                  <li key={post.slug}>
                    <div className="a-grow">
                      <a href={editPath(post.slug)} className="a-title">
                        {post.title}
                      </a>
                      <span className="a-muted">
                        {post.publishedAt ? (
                          <>
                            Veröffentlicht am {formatDate(post.publishedAt)} ·{" "}
                            <a href={pagePath(post)} target="_blank" rel="noopener">
                              {pagePath(post)}
                            </a>
                          </>
                        ) : (
                          <span className="a-draft">Entwurf</span>
                        )}
                      </span>
                    </div>
                    <form method="post" action={`/admin/blog/${post.slug}/publish`}>
                      <button name="published" value={post.publishedAt ? "0" : "1"}>
                        {post.publishedAt ? "Zurück zu Entwurf" : "Veröffentlichen"}
                      </button>
                    </form>
                    <details className="a-delete">
                      <summary>Löschen</summary>
                      <form method="post" action={`/admin/blog/${post.slug}/delete`}>
                        <button className="a-danger">„{post.title}“ endgültig löschen</button>
                      </form>
                    </details>
                    <a className="a-button" href={editPath(post.slug)}>
                      Bearbeiten
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <form method="post" action="/admin/blog" className="a-inline">
              <input name="title" placeholder="Titel des Beitrags" required maxLength={200} aria-label="Titel des neuen Beitrags" />
              <button className="a-primary">Beitrag anlegen</button>
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

function Choice<T extends Record<string, unknown>>({
  name,
  label,
  options,
  value,
  text,
}: {
  name: string;
  label: string;
  options: T;
  value: string;
  text: (option: T[keyof T]) => string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        {Object.entries(options).map(([key, option]) => (
          <option key={key} value={key}>
            {text(option as T[keyof T])}
          </option>
        ))}
      </select>
    </label>
  );
}

export function renderDesign({ user, theme, error }: { user: User; theme: ThemeSettings; error?: string }) {
  const warnings = accentWarnings(theme);
  return html(
    <html lang="de">
      <AdminHead title="Design" />
      <body>
        <AdminBar user={user} current="design" />
        <main className="a-main a-main-wide">
          <ErrorMessage error={error} />

          <section className="a-section">
            <h2>Vorlage</h2>
            <p className="a-muted">Eine Vorlage legt Farben und Schriften fest. Deine Inhalte bleiben beim Wechseln erhalten.</p>
            <div className="a-presets">
              {(Object.entries(PRESETS) as [PresetId, (typeof PRESETS)[PresetId]][]).map(([id, preset]) => (
                <form key={id} method="post" action="/admin/design/preset" className="a-preset" aria-current={theme.preset === id ? "true" : undefined}>
                  <input type="hidden" name="preset" value={id} />
                  <div
                    className="a-preset-sample"
                    style={{ background: preset.light.bg, color: preset.light.text, fontFamily: FONTS[preset.defaults.fonts].heading }}
                  >
                    <span>Aa</span>
                    <i style={{ background: preset.defaults.accent }} />
                    <i style={{ background: preset.dark.bg }} />
                  </div>
                  <strong>{preset.label}</strong>
                  <span className="a-muted">{preset.description}</span>
                  <button disabled={theme.preset === id}>{theme.preset === id ? "Aktiv" : "Verwenden"}</button>
                </form>
              ))}
            </div>
          </section>

          <section className="a-section">
            <h2>Anpassen</h2>
            <form method="post" action="/admin/design" className="a-form a-grid">
              <input type="hidden" name="preset" value={theme.preset} />
              <label>
                Akzentfarbe (Buttons, Links, Hervorhebungen)
                <input type="color" name="accent" defaultValue={theme.accent} />
              </label>
              <Choice name="fonts" label="Schrift" options={FONTS} value={theme.fonts} text={(o) => o.label} />
              <Choice name="spacing" label="Abstände" options={SPACING} value={theme.spacing} text={(o) => o.label} />
              <Choice name="radius" label="Ecken" options={RADIUS} value={theme.radius} text={(o) => o.label} />
              <Choice name="width" label="Breite des Inhalts" options={WIDTH} value={theme.width} text={(o) => o.label} />
              <Choice name="colorScheme" label="Hell oder dunkel" options={SCHEMES} value={theme.colorScheme} text={(o) => o} />
              {warnings.map((warning) => (
                <p key={warning} className="a-warning">
                  {warning}
                </p>
              ))}
              <button className="a-primary">Speichern</button>
            </form>
            <p className="a-muted">Schriften kommen vom Gerät der Besucher. Es werden keine Schriften von fremden Servern geladen.</p>
          </section>

          <section className="a-section">
            <h2>Vorschau</h2>
            <iframe className="a-preview" src="/" title="Vorschau der Startseite" />
          </section>
        </main>
      </body>
    </html>,
  );
}
