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
// Address and phone as text, then the opening hours.
const contactDetails = (): Draft[] => [text(), heading("Öffnungszeiten", 3), strip(newBlock("hours")), button("E-Mail schreiben")];
const strip = <T extends Block>(block: T): Draft => {
  const { id: _, ...rest } = block;
  return rest as Draft;
};

export type SectionTemplate = { id: string; label: string; hint: string; blocks: () => Block[] };

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
    hint: "Adresse, Öffnungszeiten und ein Button",
    drafts: () => [
      section("soft"),
      heading("Kontakt"),
      ...contactDetails(),
    ],
  },
} satisfies Record<string, { label: string; hint: string; drafts: () => Draft[] }>;

export type SectionTemplateId = keyof typeof sections;

export const sectionTemplates: SectionTemplate[] = Object.entries(sections).map(([id, { label, hint, drafts }]) => ({
  id,
  label,
  hint,
  blocks: () => withIds(drafts()),
}));

// Inserting a template that opens a band in the middle of a page would pull the blocks
// after it into that band. So the band that was running there continues after the template.
export function insertTemplate(list: Block[], at: number, template: Block[]): Block[] {
  const after = list.slice(at);
  const opensBand = template[0]?.type === "section";
  if (opensBand && after.length > 0 && after[0]!.type !== "section") {
    const running = list.slice(0, at).findLast((block) => block.type === "section");
    const background = running?.type === "section" ? running.background : "plain";
    template = [...template, { id: crypto.randomUUID(), type: "section", background }];
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
    drafts: (title: string) => [heading(title, 1), ...contactDetails()],
  },
} satisfies Record<string, { label: string; drafts: (title: string) => Draft[] }>;

export type PageTemplateId = keyof typeof pages;

export const pageTemplates = Object.entries(pages).map(([id, { label }]) => ({ id: id as PageTemplateId, label }));

export const isPageTemplate = (id: unknown): id is PageTemplateId => typeof id === "string" && Object.hasOwn(pages, id);

export const pageBlocks = (template: PageTemplateId, title: string): Block[] => withIds(pages[template].drafts(title));
