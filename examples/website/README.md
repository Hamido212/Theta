# Die Theta-Website, gebaut mit Theta

Die Website zu Theta selbst: eine Startseite nach dem Vorbild von Astro und EmDash mit zentriertem Titel, Editor-Bild, Kennzahlen, Ablauf, Funktionen und häufigen Fragen, dazu ein ehrlicher Vergleich mit Hugo, Astro und EmDash, eine Download-Seite, Impressum und Datenschutz. Sie besteht nur aus normalen Theta-Seiten und Blöcken, kommt ohne JavaScript aus und dient zugleich als Testwebsite.

![Startseite der Theta-Website](preview.webp)

## Starten und bearbeiten

```sh
bun install
bun run demo:website
```

Die Website öffnest du unter http://127.0.0.1:3109, den Editor unter http://127.0.0.1:3109/edit. Beim ersten Start erscheint ein Einrichtungs-Link im Terminal; darüber legst du dein eigenes Konto an. `THETA_DEMO_PORT` wählt einen anderen Port.

Die Daten liegen nur in `examples/website/data/`. Das Beispiel ignoriert `THETA_DB` und `THETA_UPLOADS` und weist eine fremde Datenbank in diesem Ordner zurück. Weitere Starts behalten deine Änderungen.

## Als HTML exportieren

```sh
bun run demo:website:export https://deine-adresse.de
```

schreibt die veröffentlichte Website nach `examples/website/export/`. Die Adresse wird für Suchmaschinen und Link-Vorschauen gebraucht. Den Ordner kannst du bei jedem Webhoster hochladen, etwa bei GitHub Pages mit eigener Domain, Netlify oder Cloudflare Pages.

## Vor dem Veröffentlichen

- **Impressum** und **Datenschutz** enthalten die Angaben von Hamid Yosefsei (wie auf hyos.tech). Die Datenschutzerklärung ist ein knapper Entwurf für eine Website ohne Cookies, Formular und fremde Dienste; prüfe sie, bevor die Website online geht, und ergänze den Webhoster.
- Die Download-Seite verlinkt auf [GitHub Releases](https://github.com/Hamido212/Theta/releases). Dort erscheinen die Programme, sobald ein Tag wie `v0.1.0` den Release-Workflow startet.
- Die Angaben zu Hugo, Astro und EmDash haben den Stand 1. Oktober 2026.
- Das Editor-Bild liegt in `docs/theta-editor.webp` und zeigt den Editor mit dieser Startseite. Das Logo ist `media/theta-logo.svg`; es passt sich hellen und dunklen Geräten an.
