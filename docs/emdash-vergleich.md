# EmDash: Welche Lösungen Theta weiterbringen

Stand: 1. Oktober 2026. Vergleich von Theta `0b00f57` mit EmDash `3a33f33b1f2e7ca54a36b8f497022b4256993858` (main, Commit vom 30. September). Dies ist eine gezielte Quellcodeanalyse mit Empfehlungen, keine beschlossene Implementierungsplanung und kein vollständiger Sicherheits-Audit.

Untersucht wurden Veröffentlichungszustände, Speichern und Konflikte, Vorschau, Medien, Abschnittsvorlagen, Weiterleitungen, Papierkorb, Backups, Plugin-Isolation und zugehörige Tests. EmDash wurde separat im temporären Verzeichnis geklont; seine Anwendung und Tests wurden nicht ausgeführt. Bei Theta wurden drei Speicher-/Löschverhalten mit einer isolierten In-Memory-Datenbank nachvollzogen. Bestehende Website-Inhalte blieben unverändert.

## Wichtigste Empfehlung

Theta sollte die Verbindung aus direktem Bearbeiten, Design-Vorgaben und statischem Export behalten. Von EmDash lohnt sich vor allem der zuverlässige Arbeitsablauf: Änderungen sicher aufbewahren, bewusst veröffentlichen und Fehler rückgängig machen. Danach folgen eine ruhigere Editor-Oberfläche und bessere Bild- und Abschnittsbedienung.

## 1. Entwurf und veröffentlichte Version trennen

**EmDash:** Inhalte mit Revisionsunterstützung besitzen `live_revision_id` und `draft_revision_id`. Ein Entwurf kann geändert werden, während Besucher weiterhin die veröffentlichte Fassung sehen. Die Oberfläche unterscheidet unter anderem Entwurf, veröffentlicht und veröffentlicht mit Änderungen. Veröffentlichungsaktionen prüfen den erwarteten Revisionsstand. Nicht jede beliebige Änderung ist automatisch ein Entwurf: Die Unterstützung hängt unter anderem von den Collection-Funktionen ab; bestimmte Metadaten ändern sich direkt.

**Theta:** `PageStore.save()` aktualisiert die einzige aktuelle Inhaltsfassung. Normale Seiten haben keinen Entwurfsstatus. Blogbeiträge können zunächst Entwürfe sein, aber Änderungen an einem veröffentlichten Beitrag werden beim Speichern ebenfalls direkt sichtbar. Verlauf allein ersetzt keine getrennte Live-Version.

**Vorschlag:** Speichern hält zunächst den Arbeitsstand fest. Eine eigene Aktion „Veröffentlichen“ übernimmt genau diesen Stand. Der Editor zeigt „Entwurf gespeichert“ oder „Änderungen noch nicht veröffentlicht“. Öffentliche Seiten, Navigation, RSS, Sitemap und HTML-Export müssen durchgängig auf die veröffentlichte Fassung zugreifen. Bestehende Seiten werden bei einer Migration als veröffentlicht übernommen.

Quellen: [EmDash-Zustände](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/admin/src/lib/content-publishing-state.ts), [Revisionen und Publikation](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/core/src/database/repositories/content.ts#L2414), Theta `src/store.ts:130`.

## 2. Automatisch speichern, ohne Änderungen zu überschreiben

**EmDash:** Der Editor speichert zeitverzögert nach Änderungen, berücksichtigt laufende Speicher- und Veröffentlichungsaktionen und hält Autosave bei Konflikten an. Ein `_rev`-Token und Bedingungen beim Datenbank-Update verhindern das unbemerkte Überschreiben eines neueren Standes. Die Tests behandeln ausdrücklich Rennen zwischen Autosave, Veröffentlichung und parallelen Änderungen.

**Theta:** Manuelles Speichern und eine Warnung beim Verlassen sind vorhanden. Der lokale `version`-Zähler schützt die Anzeige „Gespeichert“ bei weiterem Tippen; er wird nicht als Konfliktprüfung an den Server übertragen. Ein alter Tab kann neuere Inhalte ersetzen.

**Nachvollzogen:** Tab A speichert einen neuen Titel. Danach speichert Tab B seinen alten Titel zusammen mit einer anderen Änderung. Der neue Titel wird wieder durch den alten ersetzt. Die alten Fassungen stehen noch im Verlauf, aber die Anwendung verhindert den Konflikt nicht.

**Vorschlag:** Zuerst eine serverseitig geprüfte, monoton steigende Version einführen. Veraltete Schreibversuche liefern einen verständlichen Konflikt. Danach Autosave für Entwürfe ergänzen, ausstehende Speichervorgänge ordnen und vor dem Veröffentlichen den aktuellen Stand sichern. Autosave nicht ungeprüft auf das jetzige Live-Speichern setzen. Versionshistorie sinnvoll bündeln, damit 50 kleine Autosaves nicht sofort die gesamte bisherige Historie verdrängen.

Quellen: [Autosave](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/admin/src/components/ContentEditor.tsx#L1041), [Konflikttests](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/core/tests/unit/api/publish-revision-cas.test.ts), [Browser-Tests zu Autosave und Veröffentlichung](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/admin/tests/publish-autosave-race.test.tsx), Theta `src/editor/main.tsx:137`.

## 3. Papierkorb und Backup

**EmDash:** Löschen setzt `deleted_at`. Wiederherstellen holt Inhalte als Entwurf zurück; endgültiges Löschen ist eine separate Aktion. Der untersuchte JSON-Backup-Handler sichert Inhalte einschließlich Entwürfen und Revisionen, aber ausdrücklich keine Mediendateien oder Zugangsdaten. Daneben existiert ein umfangreicherer Site-Transfer-Bereich; JSON-Backup und vollständigen Umzug darf man nicht gleichsetzen.

**Theta:** `PageStore.delete()` löscht die Seite und ihren Verlauf endgültig. Das wurde mit einer temporären Seite bestätigt: drei Revisionen vorher, keine Seite und keine Revision danach. Der statische Export ist keine Wiederherstellungssicherung für den Editor.

**Vorschlag:** Papierkorb früh ergänzen. Separat ein geprüftes Backup-/Restore-Format für Datenbank und Medien planen. Bei laufender SQLite-WAL-Datenbank einen konsistenten Snapshot erzeugen; bloßes Kopieren von `theta.db` im laufenden Betrieb reicht als Backup-Verfahren nicht. Zugangsdaten und aktive Sitzungen beim Wiederherstellen ausdrücklich behandeln. Wiederherstellung in ein leeres Ziel praktisch testen.

Quellen: [Papierkorb](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/core/src/database/repositories/content.ts#L1601), [Backup-Inhalt und Grenzen](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/core/src/api/handlers/backup.ts), Theta `src/store.ts:194`, `src/export.ts`, `src/db.ts`.

## 4. Den Screenshot auf Thetas Editor übertragen

Der Screenshot zeigt eine klare Aufteilung: Navigation links, Inhalt in der Mitte, Veröffentlichungs- und Dokumenteinstellungen rechts. Diese Ordnung ist für Theta sinnvoll.

**Vorschlag für Theta:** Links Seiten und eine kompakte Abschnittsübersicht; in der Mitte die direkt bearbeitbare Website; rechts die Einstellungen des ausgewählten Blocks beziehungsweise der Seite. Oben ein verständlicher Speicherstatus, Vorschau und Veröffentlichung. Auf kleinen Bildschirmen werden die Seitenleisten einblendbar. Damit beanspruchen Block-Einstellungen nicht mehr so viel Platz innerhalb der Website.

Theta braucht dafür nicht alle Menüpunkte aus dem Screenshot. Content Types, Byline Schema, Taxonomien und Plugin-Verwaltung sind für den bisherigen Einsteigerfokus keine Voraussetzung. Die Übertragung der Anordnung ist ein Designvorschlag; sie wurde hier noch nicht als Oberfläche gebaut oder auf Benutzbarkeit getestet.

## 5. Bild-Fokuspunkt und bessere Mediathek

**EmDash:** Ein Fokuspunkt wird als zwei Werte zwischen 0 und 1 gespeichert, validiert und in CSS-`object-position` übersetzt. Die Oberfläche zeigt Hochformat-, Quadrat- und Querformat-Vorschauen und unterstützt Maus sowie Tastatur. Die Mediendetails bieten außerdem Zuschneiden und eine Anzeige der Verwendung.

**Theta:** Bilder werden bereits optimiert und in mehreren Größen ausgeliefert. Das Medienmodell enthält noch keinen Fokuspunkt; die Bildkomponente bietet keinen entsprechenden Parameter. Ein Warnmechanismus für verwendete Bilder existiert bereits und wäre auszubauen, nicht neu zu erfinden.

**Vorschlag:** Zuerst „Wichtiges Motiv markieren“ für Hero, Karten und zugeschnittene Galerien. Das verbessert mobile Bildausschnitte ohne JavaScript auf der öffentlichen Seite. Danach Suche und Filter für die Mediathek. Beim Ersetzen von Bildern neue Dateiadressen verwenden, damit lang gecachte alte Bilder nicht weiter erscheinen. Alt-Text je Verwendung bleibt kontextabhängig; ein zentraler Medien-Alt-Text wäre nur ein Vorschlag.

Quellen: [Fokuspunkt-Bedienung](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/admin/src/components/FocalPointEditor.tsx), [Validierung und CSS](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/core/src/media/focal-point.ts), Theta `src/media.ts`, `src/theme/image.tsx`.

## 6. Eigene Abschnittsvorlagen speichern

**EmDash:** Abschnitte werden in einer Bibliothek mit Titel, Beschreibung, Suchbegriffen und Inhalt verwaltet. Der Editor kann sie suchen und ihren Inhalt an der Cursorposition einfügen. Der untersuchte Einfügepfad kopiert Inhalt; er beweist keine global synchronisierten Instanzen.

**Theta:** Fertige Abschnitte sind bereits in `src/templates.ts` definiert. Nutzer können dort bislang keine eigene Kombination speichern. Abschnittsmarkierungen definieren den Bereich bis zur nächsten Markierung; sie sind keine verschachtelten Container.

**Vorschlag:** Erst ganze Abschnitte auswählen, verschieben und duplizieren können. Danach „Als Vorlage speichern“ mit Vorschaukarten und Suche ergänzen. Eine unabhängige Kopie ist der verständliche Standard. Global synchronisierte Bereiche wie ein auf mehreren Seiten verwendeter Kontaktblock wären eine spätere, ausdrücklich getrennte Funktion.

Quellen: [Abschnittseditor](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/admin/src/components/SectionEditor.tsx), [Einfügepfad](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/admin/src/components/PortableTextEditor.tsx#L3761), Theta `src/templates.ts`, `src/theme/blocks.tsx`.

## 7. Danach: Vorschau teilen, Adressen ändern, Veröffentlichung planen

- **Teilbare Vorschau:** EmDash signiert zeitlich begrenzte, inhaltsbezogene Vorschau-Tokens. Für Theta sinnvoll zur Freigabe durch Kunden. Voraussetzung sind getrennte Entwürfe. Vorschau darf nicht in öffentliche Caches, Sitemap oder statischen Export geraten.
- **Weiterleitungen:** EmDash legt bei geeigneten Slug-Änderungen automatisch eine 301-Weiterleitung an und berücksichtigt Konflikte. Bei Theta sollte eine stabile Seiten-ID zuerst die Rolle des Slugs als Primärschlüssel ablösen oder die Umbenennung alle Referenzen konsistent migrieren. Bei statischen Exporten hängen echte HTTP-Weiterleitungen vom Hoster ab; HTML allein garantiert keine 301.
- **Zeitgesteuerte Veröffentlichung:** EmDash verwendet einen Scheduler statt die Veröffentlichung an einen Besucheraufruf zu koppeln. Für Theta erst nach sauberer Entwurfs-/Live-Trennung. Eine bereits exportierte statische Website benötigt zum Termin einen neuen Export und ein Deployment; sie veröffentlicht sich nicht von selbst.

Quellen: [Vorschau-Tokens](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/core/src/preview/tokens.ts), [Weiterleitungen bei Slug-Änderung](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/core/src/api/handlers/content.ts#L768), [Scheduler](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/core/src/scheduled-publish.ts).

## Was vorerst nicht übernommen werden sollte

**Gesamter CMS-Unterbau:** EmDash löst mit Astro, dynamischen Collections, mehreren Datenbank- und Speicheradaptern, Registry und Plugin-Runtime einen größeren Aufgabenbereich. Theta braucht für die genannten Verbesserungen keinen Stack-Wechsel.

**Plugin-System auf Vorrat:** Die Isolation ist reale Laufzeittechnik. EmDash startet auf Node `workerd`, kommuniziert über eine kontrollierte Schnittstelle und prüft Berechtigungen auf Host-Seite. Ein Objekt namens `capabilities` allein würde fremden Code nicht isolieren. Bei Theta zunächst wenige saubere interne Dienste; eine Sandbox erst mit einem konkreten Plugin-Anwendungsfall.

**Sofortiger Textformat-Wechsel:** EmDash verwendet Tiptap/ProseMirror und Portable Text. Theta besitzt ein kleines eigenes Textformat. Ein ausgereifter Editor könnte bei komplexeren Textanforderungen helfen, verlangt aber Migrationen und Tests für Hin-/Rückkonvertierung, Zwischenablage, Links und Undo. Vor einem Wechsel die tatsächlichen Probleme mit Thetas Editor im Browser messen.

Quellen: [workerd-Runner](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/workerd/src/sandbox/runner.ts), [Berechtigungsprüfung](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/workerd/src/sandbox/bridge-handler.ts#L1299), [Editor-Abhängigkeiten](https://github.com/emdash-cms/emdash/blob/3a33f33b1f2e7ca54a36b8f497022b4256993858/packages/admin/package.json).

## Empfohlene Reihenfolge

1. **Verlässliches Bearbeiten:** Konfliktschutz, Entwurf/Live-Trennung, danach Autosave und Papierkorb. Kleine, getrennt prüfbare Änderungen.
2. **Besseres Bauen:** Editor mit Seitenleisten, ganze Abschnitte bedienen, Bild-Fokuspunkt, eigene Abschnittsvorlagen. Mit Café- und Studio-Beispielen auf Desktop und Mobilgerät prüfen.
3. **Portabilität und Freigabe:** Vollständiges Backup samt getesteter Wiederherstellung, Vorschau-Links, Slug-Änderungen und Weiterleitungen.
4. **Nach tatsächlichem Bedarf:** Zeitplanung, umfangreichere Blogorganisation, Mehrbenutzerbetrieb, Mehrsprachigkeit und Plugins.

Als Prüfmuster lohnt sich ebenfalls EmDash: echte Browser-Abläufe, visuelle Vergleichstests und gezielte Tests für verspätete Speicherantworten. Theta hat bereits Server- und Rendering-Tests; diese decken Cursor, Auswahl, Drag-and-drop und mobile Bedienung nicht vollständig ab. Dafür eine kleine Auswahl wichtiger Browser-Szenarien ergänzen, statt die gesamte EmDash-Testsuite nachzubauen.
