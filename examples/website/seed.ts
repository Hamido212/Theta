import type { Database } from "bun:sqlite";
import { type Block, type Column, type ColumnsBlock, type FaqItem, type HeroBlock, type Page, type SectionBlock, parseBlocks } from "../../src/blocks";
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
const section = (background: SectionBlock["background"], options: Omit<SectionBlock, "id" | "type" | "background"> = {}): Block =>
  ({ id: id(), type: "section", background, width: "content", spacing: "spacious", align: "left", ...options });
const faq = (items: FaqItem[]): Block => ({ id: id(), type: "faq", items });
const column = (title: string, body: string, extra: Partial<Column> = {}): Column => ({ title, text: body, src: "", alt: "", href: "", linkLabel: "", ...extra });
const columns = (style: ColumnsBlock["style"], items: Column[]): Block => ({ id: id(), type: "columns", style, items });
// Every page opens with a centred title on a soft glow of the accent colour.
const hero = (title: string, body: string, buttons: HeroBlock["buttons"], extra: Partial<HeroBlock> = {}): Block =>
  ({ id: id(), type: "hero", layout: "banner", tone: "glow", align: "center", width: "wide", title, text: body, src: "", alt: "", buttons, ...extra });

const figures = [
  column("0 KB", "JavaScript, das Besucher laden müssen"),
  column("0 Cookies", "kein Tracking, keine fremden Schriften"),
  column("1 Klick", "zur Sicherung oder zum HTML-Export"),
  column("3 Systeme", "Windows, macOS und Linux"),
];

const flow = [
  column("1. Starten", "Herunterladen und doppelklicken. Die Einrichtung öffnet sich im Browser."),
  column("2. Schreiben", "Klick auf einen Text und tippe. Neue Abschnitte kommen aus fertigen Vorlagen."),
  column("3. Veröffentlichen", "Änderungen bleiben Entwurf, bis du auf „Veröffentlichen“ klickst."),
];

const features = [
  column("Direkt auf der Seite", "Du bearbeitest die echte Seite. Was du siehst, sehen deine Besucher."),
  column("Stimmiges Design", "Vorlage wählen, Farbe und Schrift einstellen. Theta warnt bei schlecht lesbaren Farben."),
  column("Kontaktformular", "Nachrichten landen im Postfach und auf Wunsch per E-Mail. Ohne Captcha."),
];

const moreFeatures = [
  column("Blog mit RSS", "Beiträge mit Datum und Titelbild, dazu ein Feed für deine Leser."),
  column("Bilder, Karten, Videos", "Fotos werden automatisch verkleinert. Karten und Videos laden erst nach einem Klick."),
  column("Sicherung und Umzug", "Eine Datei enthält die ganze Website und zieht mit auf jeden Rechner."),
];

const others = [
  column("Hugo", "Ein sehr schneller Generator für statische Seiten, geschrieben in Go. Texte stehen in Markdown-Dateien, das Design programmierst du als Theme.", { meta: "Für Entwickler" }),
  column("Astro", "Ein modernes Web-Framework mit TypeScript, seit Januar 2026 Teil von Cloudflare. Seiten sind Code-Komponenten, Inhalte kommen aus Dateien oder einem CMS.", { meta: "Für Entwicklerteams" }),
  column("EmDash", "Ein CMS auf Astro-Basis von Cloudflare, Version 1.0 seit September 2026. Inhalte pflegst du in Formularen, das Theme programmieren Entwickler.", { meta: "Für Redaktionen mit Entwicklern" }),
  column("Theta", "Ein fertiges Programm: herunterladen, starten, auf der Seite tippen. Das Design wählst du aus Vorlagen und Reglern. Besucher bekommen reines HTML wie bei Hugo.", { meta: "Für alle, die ihre Website selbst pflegen" }),
];

const comparison = [
  column("Texte ändern", "Hugo und Astro: Datei oder Code bearbeiten, Website neu bauen und hochladen. Theta: auf den Text klicken, tippen, veröffentlichen."),
  column("Design", "Hugo und Astro: Theme oder Komponenten selbst programmieren. Theta: Vorlage wählen und Farbe, Schrift, Abstände und Ecken einstellen."),
  column("Kontaktformular, Karte, Blog", "Hugo und Astro: selbst bauen oder fremde Dienste einbinden. Theta: eingebaut, ohne fremde Dienste."),
  column("Installation und eigene Daten", "Hugo: ein Programm, dann Terminal. Astro: Node und Terminal. Theta: herunterladen und doppelklicken, Sicherung und HTML-Export mit einem Klick."),
];

const steps = [
  column("Herunterladen", `Lade die ZIP-Datei für dein System von der [Download-Seite auf GitHub](${RELEASES}): Windows, macOS mit Apple-Chip oder Linux.`, { meta: "Schritt 1" }),
  column("Entpacken und starten", "Entpacke die ZIP und starte „theta“ mit einem Doppelklick. Der Browser öffnet sich mit der Einrichtung. Das kleine Fenster daneben zeigt, dass Theta läuft.", { meta: "Schritt 2" }),
  column("Konto anlegen und schreiben", "Lege dein Konto an. Danach landest du direkt im Editor, klickst auf einen Text und schreibst los.", { meta: "Schritt 3" }),
  column("Online stellen", "Lade die Website unter „Übersicht“ als HTML herunter und lade sie bei deinem Webhoster hoch. Oder betreibe Theta auf einem Server, dann funktionieren auch Kontaktformulare.", { meta: "Schritt 4" }),
];

// The legal notice of the person who publishes this website.
const imprint = [
  heading("Impressum", 1),
  heading("Angaben gemäß § 5 DDG"),
  text("Hamid Yosefsei\nhyos.tech\nOsterstr. 14\n28199 Bremen"),
  heading("Kontakt"),
  text("Telefon: [0178 9681657](tel:+491789681657)\nE-Mail: [hello@hyos.tech](mailto:hello@hyos.tech)"),
  heading("Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV"),
  text("Hamid Yosefsei, Anschrift wie oben"),
  heading("Haftung für Inhalte"),
  text("Die Inhalte dieser Website wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität kann ich jedoch keine Gewähr übernehmen. Nach §§ 8 bis 10 DDG bin ich nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen. Sobald mir eine Rechtsverletzung bekannt wird, entferne ich die betroffenen Inhalte umgehend."),
  heading("Haftung für Links"),
  text("Diese Website enthält Links zu fremden Websites, etwa zu GitHub. Auf deren Inhalte habe ich keinen Einfluss, dafür ist der jeweilige Anbieter verantwortlich. Bei Bekanntwerden von Rechtsverletzungen entferne ich solche Links umgehend."),
];

const privacy = [
  heading("Datenschutz", 1),
  text("Diese Website sammelt so wenig Daten wie möglich. Sie setzt keine Cookies, nutzt keine Analyse- oder Werbedienste und lädt keine Schriften oder Skripte von fremden Servern."),
  heading("Verantwortlich"),
  text("Hamid Yosefsei\nOsterstr. 14\n28199 Bremen\nE-Mail: [hello@hyos.tech](mailto:hello@hyos.tech)"),
  heading("Beim Besuch dieser Website"),
  text("Wenn du eine Seite aufrufst, speichert der Server, auf dem diese Website liegt, kurzzeitig technische Angaben: deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse und deinen Browser. Das ist nötig, um die Website auszuliefern und vor Angriffen zu schützen (Art. 6 Abs. 1 lit. f DSGVO). Die Angaben werden nicht mit anderen Daten zusammengeführt und nach kurzer Zeit gelöscht."),
  heading("Wenn du mir schreibst"),
  text("Schreibst du mir eine E-Mail, verwende ich deine Angaben nur, um dir zu antworten (Art. 6 Abs. 1 lit. b und f DSGVO), und lösche sie, sobald sie dafür nicht mehr nötig sind."),
  heading("Links zu GitHub"),
  text("Der Download und der Quellcode liegen auf GitHub. Erst wenn du einem solchen Link folgst, gelten dort die Datenschutzhinweise von GitHub."),
  heading("Deine Rechte"),
  text("Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung deiner Daten, auf Datenübertragbarkeit und auf Widerspruch. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Landesbeauftragten für Datenschutz und Informationsfreiheit Bremen."),
];

export async function seedWebsite({ db, pages, settings, media }: { db: Database; pages: PageStore; settings: SettingsStore; media: MediaStore }) {
  const count = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pages").get()!.count;
  if (count !== 1 || pages.get("home")?.title !== "Willkommen bei Theta" || media.list().length) {
    throw new Error("Die Theta-Website benötigt eine frische Datenbank. Bestehende Inhalte werden nicht überschrieben.");
  }
  const screenshot = await media.add(new File([await Bun.file(new URL("../../docs/theta-editor.webp", import.meta.url)).bytes()], "theta-editor.webp", { type: "image/webp" }));
  const author = "Theta";
  const publish = (page: Page, blocks: Block[], description: string, inNav = true) =>
    pages.save(page.slug, { blocks: parseBlocks(blocks), description, inNav }, author, { action: "publish" });

  const comparePage = pages.create("Vergleich", author);
  publish(comparePage, [
    hero("Theta im Vergleich", "Hugo und Astro sind Werkzeuge, mit denen Entwickler Websites bauen. Theta ist für die Menschen, die ihre Website danach selbst pflegen, ganz ohne Programmierkenntnisse.", [{ label: "Theta herunterladen", href: "/download" }], { eyebrow: "Hugo, Astro, EmDash und Theta" }),
    section("plain", { spacing: "normal" }),
    heading("Vier Werkzeuge, vier Zielgruppen"),
    columns("list", others),
    section("soft"),
    heading("Was im Alltag anders ist"),
    text("Alle liefern Besuchern schnelles HTML ohne unnötiges JavaScript. Der Unterschied liegt darin, wer die Website pflegt und wie."),
    columns("list", comparison),
    section("plain"),
    heading("Wo Theta noch nicht so weit ist"),
    text("Plugins und mehrsprachige Seiten gibt es noch nicht. Wer Tausende Seiten aus Dateien erzeugt und gerne mit Git arbeitet, ist mit Hugo oder Astro gut bedient. Theta richtet sich an kleine Unternehmen, Vereine, Kreative und alle, die ihre Seite ohne Entwickler aktuell halten wollen."),
    section("inverse", { align: "center" }),
    heading("Überzeug dich selbst"),
    text("Herunterladen, doppelklicken, losschreiben."),
    button("Theta herunterladen", "/download", "primary"),
  ], "Hugo und Astro sind für Leute, die Websites bauen. Theta ist für Leute, die ihre Website selbst pflegen.");

  const downloadPage = pages.create("Download", author);
  publish(downloadPage, [
    hero("Theta herunterladen", "Ein Programm für Windows, macOS und Linux. Du brauchst kein Terminal und keine Programmierkenntnisse.", [{ label: "Zu den Downloads", href: RELEASES }, { label: "Quellcode ansehen", href: REPOSITORY }], { eyebrow: "Kostenlos, ohne Konto bei uns" }),
    section("plain", { spacing: "normal" }),
    heading("In vier Schritten zur eigenen Website"),
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

  const imprintPage = pages.create("Impressum", author);
  publish(imprintPage, imprint, "Impressum der Theta-Website.", false);
  const privacyPage = pages.create("Datenschutz", author);
  publish(privacyPage, privacy, "Wie die Theta-Website mit deinen Daten umgeht.", false);

  publish(pages.get("home")!, [
    hero("Deine Website. Von dir gepflegt.", "Theta ist ein einfaches CMS. Du klickst auf einen Text und schreibst. Das Design bleibt stimmig, die Seite bleibt schnell, und die Website gehört dir.", [
      { label: "Theta herunterladen", href: "/download" },
      { label: "Vergleich mit Hugo und Astro", href: `/${comparePage.slug}` },
    ], { eyebrow: "Für Windows, macOS und Linux", highlight: "Von dir gepflegt." }),
    { id: id(), type: "image", src: screenshot.url, alt: "Der Theta-Editor: links die Seiten, in der Mitte diese Startseite zum direkten Bearbeiten, rechts die Einstellungen des Titelbilds", caption: "", width: "wide", frame: "browser" },
    section("plain", { width: "wide", spacing: "normal", align: "center" }),
    columns("stats", figures),
    section("soft"),
    heading("So funktioniert Theta"),
    text("Drei Schritte, kein Terminal und kein Code."),
    columns("cards", flow),
    section("plain"),
    heading("Alles, was eine kleine Website braucht"),
    text("Eingebaut statt zusammengesteckt. Du musst nichts dazukaufen und keine fremden Dienste einbinden."),
    columns("plain", features),
    columns("plain", moreFeatures),
    section("soft"),
    heading("Für Menschen, nicht nur für Entwickler"),
    text("Hugo und Astro sind großartige Werkzeuge für Entwickler. Theta ist für die Person, die die Website danach jeden Tag pflegt."),
    columns("cards", [
      column("Hugo und Astro", "Texte in Dateien oder Code, Design als programmiertes Theme, nach jeder Änderung neu bauen und hochladen."),
      column("Theta", "Texte direkt auf der Seite, Design aus Vorlagen und Reglern, veröffentlichen mit einem Klick.", { href: `/${comparePage.slug}`, linkLabel: "Zum Vergleich" }),
    ]),
    section("plain"),
    heading("Häufige Fragen"),
    faq([
      { question: "Brauche ich Programmierkenntnisse?", answer: "Nein. Du arbeitest im Browser, direkt auf deiner Seite. Wer Theta erweitern möchte, findet den Quellcode in TypeScript auf GitHub." },
      { question: "Ist Theta ein KI-Baukasten?", answer: "Nein. Theta erfindet keine Seiten für dich. Du schreibst deine Inhalte, Theta sorgt dafür, dass sie gut aussehen und schnell laden." },
      { question: "Wem gehört meine Website?", answer: "Dir. Alles liegt auf deinem Rechner oder Server, nicht bei uns. Du kannst die Website jederzeit als HTML exportieren und ohne Theta weiter betreiben." },
      { question: "Wo finde ich den Quellcode?", answer: `Auf [GitHub](${REPOSITORY}).` },
    ]),
    section("inverse", { align: "center" }),
    heading("Bereit für deine eigene Website?"),
    text("Herunterladen, doppelklicken, losschreiben. Diese Website ist übrigens selbst mit Theta gebaut und kommt ohne JavaScript aus."),
    button("Theta herunterladen", "/download", "primary"),
    button("Quellcode auf GitHub", REPOSITORY),
  ], "Theta ist ein einfaches CMS für alle, die ihre Website selbst pflegen: direkt auf der Seite bearbeiten, schnell ab Werk, und die Website gehört dir.");
  pages.save("home", { title: "Theta: deine Website, von dir gepflegt" }, author, { action: "publish" });

  settings.saveSite({
    ...settings.site(),
    name: "Theta",
    language: "de",
    logo: "/media/theta-logo.svg",
    description: "Ein einfaches CMS für alle, die ihre Website selbst pflegen.",
    footer: `Das einfache CMS für alle, die ihre Website selbst pflegen.\nQuellcode auf [GitHub](${REPOSITORY})`,
    imprint: imprintPage.slug,
    privacy: privacyPage.slug,
  });
  settings.saveTheme({ ...defaultTheme("studio"), accent: "#4f46e5" });
  db.query("INSERT INTO settings (key, value) VALUES ('theta_website', ?)").run(JSON.stringify({ createdAt: new Date().toISOString() }));
  return { comparePage, downloadPage, imprintPage, privacyPage, screenshot };
}
