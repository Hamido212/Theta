# Theta

Ein einfaches, modernes CMS. Für alle, die eine Website pflegen wollen, ohne programmieren zu können, und für Entwickler, die es erweitern.

![Der Theta-Editor: Texte werden direkt auf der Seite bearbeitet](docs/editor.png)

## Ausprobieren

Voraussetzung ist [Bun](https://bun.sh).

```sh
bun install
bun run dev
```

Danach zeigt http://localhost:3000 die Website und http://localhost:3000/edit den Editor. Klick auf einen Text und schreib los, gespeichert wird mit dem Knopf oder mit Strg+S (⌘+S).

## Was der Prototyp zeigt

- **Direkt auf der Seite bearbeiten.** Der Editor zeigt die Seite genau so, wie Besucher sie sehen. Texte ändert man an Ort und Stelle, Blöcke lassen sich hinzufügen, verschieben und löschen.
- **Leitplanken statt Stil-Chaos.** Blöcke speichern nur Inhalt. Farben, Schriften und Abstände kommen aus den Design-Tokens des Themes (`src/theme/theme.css`), deshalb bleibt die Seite immer stimmig.
- **Die Website ist eine Datei.** Alle Inhalte liegen in einer einzigen SQLite-Datei (`theta.db`). Kopieren heißt umziehen.
- **Schnell ab Werk.** Die öffentliche Seite ist reines HTML und CSS, ganz ohne JavaScript.
- **Barrierefreiheit im Blick.** Fehlt einem Bild die Beschreibung, weist der Editor darauf hin.

Drei Blocktypen gibt es bisher: Überschrift, Text und Bild.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/blocks.ts` | Datenmodell der Blöcke und Prüfung aller Eingaben |
| `src/store.ts` | Speicherung in SQLite |
| `src/theme/` | Das Standard-Theme: Block-Komponenten und Design-Tokens |
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

## Noch nicht enthalten

Der Editor hat noch keine Anmeldung. Deshalb lauscht der Server nur auf dem eigenen Rechner; bitte nicht öffentlich betreiben. Ebenfalls später: mehrere Seiten, Bilder hochladen, Änderungsverlauf, statischer Export und Plugins.

## Entwicklung

```sh
bun test           # Tests
bun run typecheck  # Typprüfung
```
