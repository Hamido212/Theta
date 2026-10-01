import type { Database } from "bun:sqlite";
import { type Block, type Column, type ColumnsBlock, type FaqItem, type Page, type SectionBackground, parseBlocks } from "../../src/blocks";
import type { MediaStore } from "../../src/media";
import type { PageStore, SettingsStore } from "../../src/store";
import { defaultTheme } from "../../src/theme/tokens";

// Theta's own website, made of ordinary Theta pages and blocks. It explains what Theta is
// for and how it differs from Hugo and Astro, and it doubles as a real test website.

const RELEASES = "https://github.com/Hamido212/Theta/releases";
const REPOSITORY = "https://github.com/Hamido212/Theta";

const id = () => crypto.randomUUID();
const heading = (text: string, level: 1 | 2 | 3 = 2): Block => ({ id: id(), type: "heading", text, level });
const text = (text: string): Block => ({ id: id(), type: "text", text });
const button = (label: string, href: string, variant: "primary" | "secondary" = "secondary"): Block => ({ id: id(), type: "button", label, href, variant });
const section = (background: SectionBackground, align: "left" | "center" = "left"): Block => ({ id: id(), type: "section", background, width: "content", spacing: "spacious", align });
const faq = (items: FaqItem[]): Block => ({ id: id(), type: "faq", items });
const column = (title: string, body: string, meta = ""): Column => ({ title, text: body, meta, src: "", alt: "", href: "", linkLabel: "" });
const columns = (style: ColumnsBlock["style"], items: Column[]): Block => ({ id: id(), type: "columns", style, items });

const promises = [
  column("Direkt auf der Seite bearbeiten", "Du siehst deine Website so, wie Besucher sie sehen, und änderst sie an Ort und Stelle. Farben, Schriften und Abstände kommen aus dem Design. Deshalb kann nichts verrutschen."),
  column("Deine Website gehört dir", "Alles liegt bei dir: auf deinem Rechner oder deinem Server. Mit einem Klick lädst du eine Sicherung oder die ganze Website als HTML herunter, die bei jedem Webhoster läuft."),
  column("Schnell und sicher ab Werk", "Besucher bekommen reines HTML und CSS, ganz ohne JavaScript. Videos und Karten laden erst nach einem Klick, und Schriften kommen nie von fremden Servern."),
];

const others = [
  column("Hugo", "Ein sehr schneller Generator für statische Seiten, geschrieben in Go. Texte stehen in Markdown-Dateien, das Design programmierst du als Theme. Stark für Entwickler und große Dokumentationen.", "Für Entwickler"),
  column("Astro", "Ein modernes Web-Framework mit TypeScript, seit Januar 2026 Teil von Cloudflare. Seiten sind Code-Komponenten, Inhalte kommen aus Dateien oder einem CMS. Stark für Entwicklerteams.", "Für Entwickler"),
  column("EmDash", "Ein CMS auf Astro-Basis von Cloudflare, Version 1.0 seit September 2026. Inhalte pflegst du in Formularen, abgeschottete Plugins fragen um Erlaubnis. Das Theme programmieren Entwickler.", "Für Redaktionen mit Entwicklern"),
  column("Theta", "Ein fertiges Programm: herunterladen, starten, auf der Seite tippen. Das Design wählst du aus Vorlagen und Reglern. Besucher bekommen reines HTML wie bei Hugo.", "Für alle, die ihre Website selbst pflegen"),
];

const comparison = [
  column("Texte ändern", "Hugo und Astro: Datei oder Code bearbeiten, Website neu bauen und hochladen. Theta: auf den Text klicken, tippen, veröffentlichen."),
  column("Design", "Hugo und Astro: Theme oder Komponenten selbst programmieren. Theta: Vorlage wählen und Farbe, Schrift, Abstände und Ecken einstellen. Theta warnt bei schlecht lesbaren Farben."),
  column("Kontaktformular, Karte, Blog", "Hugo und Astro: selbst bauen oder fremde Dienste einbinden. Theta: eingebaut, ohne fremde Dienste."),
  column("Installation und eigene Daten", "Hugo: ein Programm, dann Terminal. Astro: Node und Terminal. Beide speichern Dateien in einem Ordner. Theta: herunterladen und doppelklicken, Sicherung und HTML-Export mit einem Klick."),
];

const steps = [
  column("Herunterladen", `Lade die ZIP-Datei für dein System von der [Download-Seite auf GitHub](${RELEASES}): Windows, macOS mit Apple-Chip oder Linux.`, "Schritt 1"),
  column("Entpacken und starten", "Entpacke die ZIP und starte „theta“ mit einem Doppelklick. Der Browser öffnet sich mit der Einrichtung. Das kleine Fenster daneben zeigt, dass Theta läuft.", "Schritt 2"),
  column("Konto anlegen und schreiben", "Lege dein Konto an. Danach landest du direkt im Editor, klickst auf einen Text und schreibst los. Mit Vorlagen startet keine Seite leer.", "Schritt 3"),
  column("Online stellen", "Lade die Website unter „Übersicht“ als HTML herunter und lade sie bei deinem Webhoster hoch. Oder betreibe Theta auf einem Server, dann funktionieren auch Kontaktformulare.", "Schritt 4"),
];

export async function seedWebsite({ db, pages, settings, media }: { db: Database; pages: PageStore; settings: SettingsStore; media: MediaStore }) {
  const count = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pages").get()!.count;
  if (count !== 1 || pages.get("home")?.title !== "Willkommen bei Theta" || media.list().length) {
    throw new Error("Die Theta-Website benötigt eine frische Datenbank. Bestehende Inhalte werden nicht überschrieben.");
  }
  const screenshot = await media.add(new File([await Bun.file(new URL("../../docs/editor-workbench.jpg", import.meta.url)).bytes()], "theta-editor.jpg", { type: "image/jpeg" }));
  const author = "Theta";
  const publish = (page: Page, blocks: Block[], description: string, inNav = true) =>
    pages.save(page.slug, { blocks: parseBlocks(blocks), description, inNav }, author, { action: "publish" });

  const comparePage = pages.create("Vergleich", author);
  publish(comparePage, [
    heading("Theta, Hugo und Astro", 1),
    text("Hugo und Astro sind Werkzeuge, mit denen Entwickler Websites bauen. Theta ist für die Menschen, die ihre Website danach selbst pflegen, ganz ohne Programmierkenntnisse."),
    columns("cards", others.slice(0, 2)),
    columns("cards", others.slice(2)),
    section("soft"),
    heading("Im Vergleich"),
    text("Alle drei liefern Besuchern schnelles HTML ohne unnötiges JavaScript. Der Unterschied liegt darin, wer die Website pflegt und wie."),
    columns("list", comparison),
    section("plain"),
    heading("Wo Theta noch nicht so weit ist"),
    text("Plugins und mehrsprachige Seiten gibt es noch nicht. Wer Tausende Seiten aus Dateien erzeugt und gerne mit Git arbeitet, ist mit Hugo oder Astro gut bedient. Theta richtet sich an kleine Unternehmen, Vereine, Kreative und alle, die ihre Seite ohne Entwickler aktuell halten wollen."),
    button("Theta herunterladen", "/download", "primary"),
  ], "Hugo und Astro sind für Leute, die Websites bauen. Theta ist für Leute, die ihre Website selbst pflegen.");

  const downloadPage = pages.create("Download", author);
  publish(downloadPage, [
    heading("Theta herunterladen", 1),
    text("Theta ist ein Programm für Windows, macOS und Linux. Du brauchst kein Terminal und keine Programmierkenntnisse."),
    button("Zu den Downloads", RELEASES, "primary"),
    columns("timeline", steps),
    section("soft"),
    heading("Auf einem eigenen Server"),
    text("Mit Docker läuft Theta auf jedem Server. Datenbank, Bilder und Sicherungen liegen im Volume „/data“:\n\ndocker run -d -p 3000:3000 -v theta-daten:/data ghcr.io/hamido212/theta\n\nDen Einrichtungs-Link zeigt „docker logs“ an. Für den Betrieb im Internet gehört ein Proxy mit HTTPS davor."),
    section("plain"),
    heading("Häufige Fragen"),
    faq([
      { question: "Mein Mac sagt, das Programm stammt von einem unbekannten Entwickler.", answer: "Theta ist noch nicht bei Apple signiert. Klicke mit der rechten Maustaste auf „theta“, wähle „Öffnen“ und bestätige. Das ist nur beim ersten Start nötig." },
      { question: "Windows zeigt eine SmartScreen-Warnung.", answer: "Klicke auf „Weitere Informationen“ und dann auf „Trotzdem ausführen“. Auch hier fehlt noch eine Signatur." },
      { question: "Wo liegen meine Daten?", answer: "Im Ordner „theta-daten“ neben dem Programm. Unter „Übersicht“ lädst du jederzeit eine Sicherung herunter. Auf einem neuen Rechner spielst du sie gleich bei der Einrichtung ein." },
      { question: "Wie kommt meine Website ins Internet?", answer: "Unter „Übersicht“ lädst du die Website als ZIP mit fertigen HTML-Dateien herunter. Die lädst du bei deinem Webhoster hoch. Kontaktformulare brauchen dagegen einen laufenden Theta-Server." },
    ]),
  ], "Theta für Windows, macOS und Linux herunterladen, entpacken und mit einem Doppelklick starten.");

  publish(pages.get("home")!, [
    { id: id(), type: "hero", layout: "banner", width: "wide", title: "Deine Website. Von dir gepflegt.", text: "Theta ist ein einfaches CMS. Du klickst auf einen Text und schreibst. Das Design bleibt stimmig, die Seite bleibt schnell, und die Website gehört dir.", src: "", alt: "", buttons: [{ label: "Theta herunterladen", href: "/download" }, { label: "Vergleich mit Hugo und Astro", href: `/${comparePage.slug}` }] },
    { id: id(), type: "image", src: screenshot.url, alt: "Der Theta-Editor: links die Seiten, in der Mitte die Website zum direkten Bearbeiten, rechts die Einstellungen des ausgewählten Bildes", caption: "So sieht der Editor aus. Du bearbeitest die echte Seite, nicht ein Formular.", width: "wide" },
    section("soft"),
    heading("Drei Versprechen"),
    columns("cards", promises),
    section("plain"),
    heading("Was schon drin ist"),
    text("- Seiten mit Menü, Vorlagen und fertigen Abschnitten\n- Blog mit RSS-Feed\n- Kontaktformular mit Postfach und E-Mail, ohne Captcha\n- Bilder, Galerien, Karten, Videos, Preislisten, Öffnungszeiten, Team und häufige Fragen\n- Entwürfe, Verlauf, Papierkorb und Weiterleitungen\n- Sicherung mit einem Klick und HTML-Export für jeden Webhoster"),
    text("Theta ist bewusst kein KI-Baukasten, der Seiten für dich erfindet. Du schreibst deine Inhalte, Theta sorgt dafür, dass sie gut aussehen."),
    section("accent", "center"),
    heading("Probier es aus"),
    text("Herunterladen, doppelklicken, losschreiben. Diese Website ist übrigens selbst mit Theta gebaut und kommt ohne JavaScript aus."),
    button("Theta herunterladen", "/download", "primary"),
    section("plain"),
    heading("Häufige Fragen"),
    faq([
      { question: "Brauche ich Programmierkenntnisse?", answer: "Nein. Du arbeitest im Browser, direkt auf deiner Seite. Wer Theta erweitern möchte, findet den Quellcode in TypeScript auf GitHub." },
      { question: "Was unterscheidet Theta von Hugo und Astro?", answer: `Hugo und Astro sind Werkzeuge für Entwickler. Theta ist das fertige Programm für die Person, die die Website pflegt. Mehr dazu im [Vergleich](/${comparePage.slug}).` },
      { question: "Wem gehört meine Website?", answer: "Dir. Alles liegt auf deinem Rechner oder Server, nicht bei uns. Du kannst die Website jederzeit als HTML exportieren und ohne Theta weiter betreiben." },
      { question: "Wo finde ich den Quellcode?", answer: `Auf [GitHub](${REPOSITORY}).` },
    ]),
  ], "Theta ist ein einfaches CMS für alle, die ihre Website selbst pflegen: direkt auf der Seite bearbeiten, schnell ab Werk, und die Website gehört dir.");
  pages.save("home", { title: "Theta: deine Website, von dir gepflegt" }, author, { action: "publish" });

  settings.saveSite({
    ...settings.site(),
    name: "Theta",
    language: "de",
    description: "Ein einfaches CMS für alle, die ihre Website selbst pflegen.",
    footer: `Theta auf [GitHub](${REPOSITORY}) · Diese Website ist mit Theta gebaut und kommt ohne JavaScript aus.`,
  });
  settings.saveTheme({ ...defaultTheme("studio"), accent: "#4f46e5" });
  db.query("INSERT INTO settings (key, value) VALUES ('theta_website', ?)").run(JSON.stringify({ createdAt: new Date().toISOString() }));
  return { comparePage, downloadPage, screenshot };
}
