import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Server-rendered admin screens. They work without JavaScript: plain forms that post back.

function AdminDocument({ title, children }: { title: string; children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{`${title} · Theta`}</title>
        <link rel="icon" href="/media/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/assets/admin.css" />
      </head>
      <body>
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

export function renderLogin({ error, email = "", next = "/edit" }: { error?: string; email?: string; next?: string }) {
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
