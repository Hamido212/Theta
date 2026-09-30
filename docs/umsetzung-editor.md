# Umsetzung: zuverlässig veröffentlichen, einfacher gestalten

- [x] 1. Bestehende Websites migrieren; Entwurf und Live-Fassung trennen.
- [x] 2. Konfliktschutz, geordnetes Autosave und geschützte Vorschau.
- [x] 3. Papierkorb mit Wiederherstellung; Medien für Live-Fassungen bewahren.
- [x] 4. Editor mit Seiten-/Abschnittsnavigation und Einstellungsleiste.
- [x] 5. Abschnitte als Gruppe bedienen, Layout-Vorgaben und eigene Vorlagen.
- [x] 6. Bild-Fokuspunkt für Titelbilder, Karten und Galerien.
- [x] 7. Migration, Veröffentlichung, Export und Editor testen; README aktualisieren.
- [x] 8. Änderungen committen und nach GitHub pushen.

Gestaltung: neutrale Werkzeugoberfläche (#f5f7fa), weiße Flächen (#ffffff), dunkle Schrift (#182334), gedämpfte Beschriftung (#526175), blaue Aktionen (#245bd6), feine Grenzen (#dce2eb). Systemschrift für Werkzeuge; die Website behält die gewählten Theme-Schriften. Links kompakte Navigation, Mitte direkt bearbeitbare Website, rechts kontextbezogene Einstellungen. Seitenleisten werden auf kleinen Bildschirmen einblendbar. Die ausgewählte Abschnittsgruppe verbindet Navigation und Website sichtbar.

Nicht Teil dieses Umsetzungspakets: öffentlicher Freigabe-Link, Backup/Restore, Adressänderungen, Zeitplanung, Rollen, Plugins und Mehrsprachigkeit.

Prüfung: 154 Tests erfolgreich, Typprüfung fehlerfrei. Neue Regressionstests decken bestehende Datenbanken, private Entwürfe in HTML/RSS/Sitemap/Export, veraltete Speicher- und Veröffentlichungsversuche, Autosave-Reihenfolge, Offline-Wiederholung, Verlauf, Papierkorb, Medienverweise, Abschnittsgruppen, eigene Vorlagen und Fokuspunkte ab. Der ZIP-Test verwendet fflate und läuft auch ohne ein externes unzip-Programm unter Windows.

Browserprüfung mit isolierter Testdatenbank: Entwurf bearbeiten und veröffentlichen, Konflikt nach Änderung in anderer Sitzung, Abschnitt verdoppeln, eigene Vorlage speichern/einfügen, Fokuspunkt per Tastatur sowie Desktop- und Mobilansicht. Ein nur im Browser auftretender fetch-Aufruffehler wurde behoben und als Regressionstest aufgenommen. Die vorhandene lokale Website-Datenbank wurde dabei nicht verwendet.
