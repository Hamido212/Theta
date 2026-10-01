# Aufgaben aus dem HYOS-Praxistest

## 1. Speicherstatus

- [x] Laufende und wartende Speicheraktionen im Editor korrekt anzeigen, auch während weiterer Eingaben.
- [x] Langsame Anfragen erklären und unbeantwortete Anfragen zeitlich begrenzen.
- [x] Fehler, erneutes Speichern, Konflikte und verspätete Antworten testen.

## 2. Layout-Voreinstellungen

- [x] Gemeinsame Seitenabstände für Titelbild und alle Abschnittsbreiten, auch im Editor.
- [x] Die Inhaltsbreite des Titelbilds auswählbar machen; bestehende Dokumente behalten ihre Auswahl.
- [x] Desktop und Handy auf abgeschnittene Inhalte und unterschiedliche Einzüge prüfen.

## 3. Agentur-Vorlagen

- [x] Zusammenpassende Abschnitte für Einstieg, Leistungen, Arbeitsbeispiele, Ablauf, Vorstellung, FAQ und Kontakt.
- [x] Vollständige Agentur-Seitenvorlagen sowie Suche und Kategorien in der Abschnittsauswahl.
- [x] Unabhängige Kopien und Einfügen zwischen bestehenden Abschnitten testen.

## 4. Gemeinsam gepflegte Abschnitte

- [x] Abschnitte zentral als Entwurf bearbeiten, mit eigenem Verlauf und Versionsschutz.
- [x] Auf mehreren Seiten einbinden, eindeutig als zentral gepflegt kennzeichnen und bei Bedarf in eine Kopie umwandeln.
- [x] Zentrale Änderungen erst durch Veröffentlichung auf allen eingebundenen Seiten übernehmen.
- [x] Verwendung anzeigen; ungültige Referenzen, Verschachtelung und Entfernen verwendeter Abschnitte verhindern.
- [x] Öffentliche Seiten, Vorschau und statischer Export verwenden dieselbe veröffentlichte Fassung.

## Abschluss

- [x] Gesamte Testsuite und TypeScript-Prüfung.
- [x] Browserprüfung mit isolierten Testdaten; HYOS-Inhalte erhalten.
- [x] Dokumentation der Bedienung und Speicher-API.
- [ ] Commit, Push und GitHub-PR.

## Prüfergebnisse vom 1. Oktober 2026

- `bun test`: 176 Tests erfolgreich, kein Fehler.
- `bun run typecheck` und `git diff --check`: erfolgreich.
- Chrome, getrennte Testdatenbank und Mediathek: Agentur-Seitenvorlage, Suche und Kategorien, Einbindung auf zwei Seiten, privater zentraler Entwurf, gemeinsame Veröffentlichung, Umwandlung in eine Kopie, Anlegen eines zentralen Entwurfs aus einem lokalen Abschnitt und aktuelle Verwendungsanzeige.
- Verzögerte Speicherung im Browser: Während einer sechs Sekunden dauernden Anfrage eingegebener neuer Text wird danach gespeichert; der Status erklärt die Verzögerung.
- Desktop und 390-Pixel-Handyansicht: gleiche Einzüge für breite Titelbilder und Abschnittsüberschriften; kein horizontaler Überlauf.
- Automatisierte Regressionen: ausbleibende und verspätete Speicherantworten, Antwortkörper ohne Ende, Konflikt nach verlorener Bestätigung, Authentifizierung und fremde Origins, Verlauf, Papierkorb, Veröffentlichungs- und Löschschutz, wiederholte Einbindungen, Layoutfortsetzung sowie Export und Löschschutz zentraler Bilder.

Vorlagen enthalten Strukturen und allgemeine Überschriften. Eigene Projektbilder, Beschreibungen, FAQ-Antworten und Kontaktziele werden beim Befüllen ergänzt. Gemeinsame Abschnitte haben eigene Entwürfe; ihre Veröffentlichung aktualisiert alle bereits veröffentlichten Einbindungen sofort.
