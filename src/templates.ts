import { type Block, type SectionBackground, newBlock } from "./blocks";

// Ready-made groups of blocks, so a new page or a new part of a page starts with a
// proven layout instead of an empty column. Headings get a sensible default; body text
// stays empty so the editor shows its hints and nothing half-finished gets published.

type Draft = Block extends infer B ? (B extends Block ? Omit<B, "id"> : never) : never;

const withIds = (drafts: Draft[]): Block[] => drafts.map((draft) => ({ ...draft, id: crypto.randomUUID() }) as Block);

const heading = (text: string, level: 1 | 2 | 3 = 2): Draft => ({ type: "heading", text, level });
const text = (): Draft => ({ type: "text", text: "" });
const section = (background: SectionBackground): Draft => ({ type: "section", background });
const button = (label: string): Draft => ({ type: "button", label, href: "", variant: "primary" });
// Address and phone as text, the opening hours, then a form for messages.
const contactDetails = (): Draft[] => [text(), heading("Öffnungszeiten", 3), strip(newBlock("hours")), heading("Schreib uns", 3), strip(newBlock("form"))];
const strip = <T extends Block>(block: T): Draft => {
  const { id: _, ...rest } = block;
  return rest as Draft;
};

export type SectionTemplate = { id: string; label: string; hint: string; category?: "general" | "agency" | "custom"; blocks: () => Block[] };

const agencySection = (background: SectionBackground): Draft => ({ type: "section", background, width: "wide" });
const agencyColumns = (titles: string[], style: "cards" | "plain" = "cards"): Draft => ({
  type: "columns", style,
  items: titles.map((title) => ({ title, text: "", src: "", alt: "", href: "", linkLabel: "Mehr erfahren" })),
});

const sections = {
  offer: {
    label: "Angebot in Karten",
    hint: "Überschrift und drei Karten mit Bild, Text und Link",
    drafts: () => [section("soft"), heading("Unser Angebot"), strip(newBlock("columns"))],
  },
  about: {
    label: "Über uns",
    hint: "Überschrift, Text und ein breites Bild",
    drafts: () => [section("plain"), heading("Über uns"), text(), { ...strip(newBlock("image")), width: "wide" } as Draft],
  },
  action: {
    label: "Aufruf",
    hint: "Farbiger Abschnitt mit Überschrift, Text und Button",
    drafts: () => [section("accent"), heading("Wir freuen uns auf Sie"), text(), button("Kontakt aufnehmen")],
  },
  voices: {
    label: "Stimmen",
    hint: "Zwei Zitate zufriedener Kunden oder Gäste",
    drafts: () => [section("soft"), heading("Das sagen andere"), strip(newBlock("quote")), strip(newBlock("quote"))],
  },
  pictures: {
    label: "Bildergalerie",
    hint: "Überschrift und eine Galerie",
    drafts: () => [section("plain"), heading("Eindrücke"), strip(newBlock("gallery"))],
  },
  prices: {
    label: "Preise",
    hint: "Überschrift und eine Preisliste",
    drafts: () => [section("plain"), heading("Preise"), strip(newBlock("prices"))],
  },
  team: {
    label: "Team",
    hint: "Die Menschen hinter dem Angebot mit Foto",
    drafts: () => [section("plain"), heading("Unser Team"), strip(newBlock("team"))],
  },
  faq: {
    label: "Häufige Fragen",
    hint: "Fragen, deren Antwort sich per Klick öffnet",
    drafts: () => [section("soft"), heading("Häufige Fragen"), strip(newBlock("faq"))],
  },
  contact: {
    label: "Kontakt",
    hint: "Adresse, Öffnungszeiten und ein Kontaktformular",
    drafts: () => [
      section("soft"),
      heading("Kontakt"),
      ...contactDetails(),
    ],
  },
  "agency-intro": {
    label: "Agentur · Einstieg", hint: "Ein breiter Einstieg mit zwei Kontaktmöglichkeiten",
    drafts: () => [agencySection("accent"), heading("Gute Ideen verdienen einen guten Auftritt."), text(), button("Projekt besprechen"), { ...button("Leistungen ansehen"), variant: "secondary" } as Draft],
  },
  "agency-services": {
    label: "Agentur · Leistungen", hint: "Drei Leistungen mit Beschreibung, optionalem Bild und Link",
    drafts: () => [agencySection("soft"), heading("Was wir für dich bauen."), agencyColumns(["Websites & Gestaltung", "Individuelle Anwendungen", "Technische Begleitung"])],
  },
  "agency-work": {
    label: "Agentur · Arbeitsbeispiele", hint: "Drei Projektkarten für deine eigenen Arbeiten und Bilder",
    drafts: () => [agencySection("plain"), heading("Ausgewählte Projekte"), agencyColumns(["Projekt 1", "Projekt 2", "Projekt 3"])],
  },
  "agency-process": {
    label: "Agentur · Ablauf", hint: "Vier Schritte, die auf dem Handy untereinander stehen",
    drafts: () => [agencySection("plain"), heading("Ein klarer Weg zum Ergebnis."), agencyColumns(["01 · Verstehen", "02 · Gestalten", "03 · Entwickeln", "04 · Begleiten"], "plain")],
  },
  "agency-about": {
    label: "Agentur · Vorstellung", hint: "Ein kontrastreicher Abschnitt für dein Team und deine Arbeitsweise",
    drafts: () => [agencySection("inverse"), heading("Die Menschen hinter den Ideen."), text(), { ...strip(newBlock("image")), width: "normal" } as Draft],
  },
  "agency-faq": {
    label: "Agentur · Fragen", hint: "Typische Fragen zu Einstieg, Umfang und Weiterentwicklung; Antworten selbst ergänzen",
    drafts: () => [agencySection("plain"), heading("Häufige Fragen"), { type: "faq", items: ["Wie beginnt die Zusammenarbeit?", "Was kostet ein Projekt?", "Kann ich Inhalte selbst pflegen?", "Was passiert nach dem Start?"].map((question) => ({ question, answer: "" })) } as Draft],
  },
  "agency-contact": {
    label: "Agentur · Kontaktaufruf", hint: "Ein farbiger Abschluss mit deinem Kontaktlink",
    drafts: () => [agencySection("accent"), heading("Deine Idee ist der Anfang."), text(), button("Projekt besprechen")],
  },
} satisfies Record<string, { label: string; hint: string; drafts: () => Draft[] }>;

export type SectionTemplateId = keyof typeof sections;

export const sectionTemplates: SectionTemplate[] = Object.entries(sections).map(([id, { label, hint, drafts }]) => ({
  id,
  label,
  hint,
  category: id.startsWith("agency-") ? "agency" : "general",
  blocks: () => withIds(drafts()),
}));

// Inserting a template that opens a band in the middle of a page would pull the blocks
// after it into that band. So the band that was running there continues after the template.
export function insertTemplate(list: Block[], at: number, template: Block[]): Block[] {
  const after = list.slice(at);
  const opensBand = template[0]?.type === "section" || template[0]?.type === "shared";
  if (opensBand && after.length > 0 && after[0]!.type !== "section" && after[0]!.type !== "shared") {
    const running = list.slice(0, at).findLast((block) => block.type === "section");
    const continuation = running?.type === "section" ? running : { type: "section" as const, background: "plain" as const };
    template = [...template, { ...continuation, id: crypto.randomUUID() }];
  }
  return [...list.slice(0, at), ...template, ...after];
}

const pages = {
  blank: { label: "Leer", drafts: (title: string) => [heading(title, 1)] },
  home: {
    label: "Startseite",
    drafts: (title: string) => [
      { type: "hero", title, text: "", src: "", alt: "", buttons: [{ label: "Mehr erfahren", href: "" }] } as Draft,
      ...sections.offer.drafts(),
      ...sections.about.drafts(),
      ...sections.action.drafts(),
    ],
  },
  about: {
    label: "Über uns",
    drafts: (title: string) => [
      heading(title, 1),
      text(),
      { ...strip(newBlock("image")), width: "wide" } as Draft,
      ...sections.team.drafts(),
      ...sections.voices.drafts(),
    ],
  },
  prices: {
    label: "Preise oder Speisekarte",
    drafts: (title: string) => [heading(title, 1), text(), heading("Kategorie", 2), strip(newBlock("prices"))],
  },
  services: {
    label: "Angebot",
    drafts: (title: string) => [heading(title, 1), text(), strip(newBlock("columns")), ...sections.faq.drafts(), ...sections.action.drafts()],
  },
  contact: {
    label: "Kontakt",
    // The map follows the address, so visitors see right away where to find you.
    drafts: (title: string) => {
      const [address, ...rest] = contactDetails();
      return [heading(title, 1), address!, strip(newBlock("map")), ...rest];
    },
  },
  agency: {
    label: "Agentur · Startseite",
    drafts: (title: string) => [
      { type: "hero", title, text: "", src: "", alt: "", width: "wide", buttons: [{ label: "Projekt besprechen", href: "" }, { label: "Leistungen ansehen", href: "" }] } as Draft,
      ...sections["agency-services"].drafts(), ...sections["agency-work"].drafts(),
      ...sections["agency-process"].drafts(), ...sections["agency-about"].drafts(),
      ...sections["agency-faq"].drafts(), ...sections["agency-contact"].drafts(),
    ],
  },
  "agency-services": {
    label: "Agentur · Leistungen",
    drafts: (title: string) => [heading(title, 1), text(), ...sections["agency-services"].drafts(), ...sections["agency-faq"].drafts(), ...sections["agency-contact"].drafts()],
  },
  "agency-process": {
    label: "Agentur · Zusammenarbeit",
    drafts: (title: string) => [heading(title, 1), text(), ...sections["agency-process"].drafts(), heading("Zum Start gehört eine gute Übergabe."), text(), ...sections["agency-contact"].drafts()],
  },
  "agency-contact": {
    label: "Agentur · Kontakt",
    drafts: (title: string) => [heading(title, 1), text(), strip(newBlock("form")), agencySection("soft"), heading("Ein paar Zeilen reichen."), agencyColumns(["Dein Vorhaben", "Dein Zeitplan", "Dein Rahmen"], "plain")],
  },
} satisfies Record<string, { label: string; drafts: (title: string) => Draft[] }>;

export type PageTemplateId = keyof typeof pages;

export const pageTemplates = Object.entries(pages).map(([id, { label }]) => ({ id: id as PageTemplateId, label }));

export const isPageTemplate = (id: unknown): id is PageTemplateId => typeof id === "string" && Object.hasOwn(pages, id);

export const pageBlocks = (template: PageTemplateId, title: string): Block[] => withIds(pages[template].drafts(title));

export type SavedSectionTemplate = { id: string; title: string; blocks: Block[] };

export function findTemplates(templates: SectionTemplate[], search: string, category = "all"): SectionTemplate[] {
  const query = search.toLocaleLowerCase("de").trim();
  return templates.filter((template) => (category === "all" || (template.category ?? "general") === category) &&
    `${template.label} ${template.hint}`.toLocaleLowerCase("de").includes(query));
}
