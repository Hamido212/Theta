# Theta

Ein einfaches, modernes CMS. Für alle, die eine Website pflegen wollen, ohne programmieren zu können, und für Entwickler, die es erweitern.

![Der Theta-Editor: Texte werden direkt auf der Seite bearbeitet](docs/editor.png)

## Ausprobieren

Voraussetzung ist [Bun](https://bun.sh).

```sh
bun install
bun run dev
```

Danach zeigt http://localhost:3000 die Website. Beim ersten Start gibt Theta im Terminal einen Einrichtungs-Link aus. Darüber legst du dein Konto an und landest direkt im Editor. Später meldest du dich unter http://localhost:3000/admin an. Dort legst du neue Seiten an, ordnest das Menü und gibst deiner Website einen Namen.

Im Editor klickst du auf einen Text und schreibst los. Gespeichert wird mit dem Knopf oder mit Strg+S (⌘+S).

Passwort vergessen? `bun run theta reset-password deine@adresse.de` setzt ein neues, zufälliges Passwort und zeigt es an.

## Was der Prototyp zeigt

- **Direkt auf der Seite bearbeiten.** Der Editor zeigt die Seite genau so, wie Besucher sie sehen. Texte ändert man an Ort und Stelle, Blöcke lassen sich hinzufügen, verschieben und löschen.
- **Leitplanken statt Stil-Chaos.** Blöcke speichern nur Inhalt. Farben, Schriften und Abstände kommen aus Design-Tokens, deshalb bleibt die Seite immer stimmig. Unter `/admin/design` wählst du eine von drei Vorlagen (Klar, Modern, Warm) und passt Akzentfarbe, Schrift, Abstände, Ecken, Breite und Hell/Dunkel an. Theta warnt bei schlecht lesbaren Farben, wählt die Textfarbe auf Buttons selbst und hellt die Akzentfarbe im Dunkelmodus automatisch auf.
- **Die Website gehört dir.** Alle Inhalte liegen in einer SQLite-Datei (`theta.db`), hochgeladene Bilder im Ordner `uploads/` daneben. Kopieren heißt umziehen. Unter `/admin` lädst du die ganze Website jederzeit als ZIP mit fertigen HTML-Dateien herunter, die bei jedem Webhoster laufen, auch ohne Theta. Im Terminal geht das mit `bun run theta export <Ordner> https://deine-seite.de`.
- **Nichts geht verloren.** Jedes Speichern legt eine Version an. Über „Verlauf“ im Editor holst du eine frühere Version zurück; die letzten 50 pro Seite bleiben erhalten.
- **Schnell ab Werk.** Die öffentliche Seite ist reines HTML und CSS, ganz ohne JavaScript.
- **Bilder ohne Vorarbeit.** Hochgeladene Fotos dreht Theta richtig herum, entfernt Metadaten wie den Aufnahmeort, verkleinert sie auf höchstens 2560 Pixel und erzeugt kleinere WebP-Versionen. Besucher bekommen automatisch die passende Größe.
- **Barrierefreiheit im Blick.** Fehlt einem Bild die Beschreibung, weist der Editor darauf hin.

- **Gefunden werden.** Jede Seite hat Titel und Beschreibung für Suchmaschinen, eine kanonische Adresse und Vorschau-Daten für geteilte Links. `sitemap.xml` und `robots.txt` erzeugt Theta automatisch.

Blöcke: Überschrift, Text, Bild, Galerie, Button, Spalten, Video, Zitat und Trenner. Videos von YouTube oder Vimeo laden erst, wenn jemand auf Abspielen klickt; vorher werden keine Daten an die Plattform übertragen.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/blocks.ts` | Datenmodell der Blöcke und Prüfung aller Eingaben |
| `src/db.ts` | SQLite-Datenbank und Schema-Migrationen |
| `src/store.ts` | Speicherung der Seiten |
| `src/auth.ts` | Konten, Passwörter und Anmeldungen |
| `src/media.ts` | Hochgeladene Bilder: Prüfung, Optimierung, kleinere Versionen |
| `src/export.ts`, `src/zip.ts` | Export der Website als statische Dateien bzw. ZIP |
| `src/admin/` | Übersicht, Anmelde- und Einrichtungsseiten |
| `src/theme/` | Das Theme: Kopfzeile mit Menü, Block-Komponenten, CSS und Design-Tokens (`tokens.ts`) |
| `src/render.tsx` | Rendert die öffentliche Seite und die Editor-Seite auf dem Server |
| `src/editor/` | Der Editor im Browser (React) |
| `src/server.ts` | HTTP-Server mit Hono |

Theme-Komponenten laufen an beiden Stellen: auf dem Server für die öffentliche Seite und im Browser für den Editor. So sehen beide Ansichten immer gleich aus.

## Einstellungen

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port des Servers |
| `THETA_HOST` | `127.0.0.1` | Adresse, auf der der Server lauscht |
| `THETA_DB` | `theta.db` | Pfad zur SQLite-Datei |
| `THETA_UPLOADS` | `uploads` neben der Datenbank | Ordner für hochgeladene Bilder |
| `THETA_URL` | | Öffentliche Adresse, z. B. `https://meine-seite.de`, wenn Theta hinter einem Proxy läuft |

## Noch nicht enthalten

Plugins kommen noch. Der Server lauscht standardmäßig nur auf dem eigenen Rechner. Für den Betrieb im Internet setzt du `THETA_HOST=0.0.0.0` und stellst einen Proxy mit HTTPS davor.

## Entwicklung

```sh
bun test           # Tests
bun run typecheck  # Typprüfung
```
