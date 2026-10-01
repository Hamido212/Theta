import type { Database } from "bun:sqlite";
import { type Block, type Column, type ColumnsBlock, type Page, parseBlocks } from "../../src/blocks";
import type { MediaStore } from "../../src/media";
import { PageStore, SettingsStore } from "../../src/store";
import { defaultTheme } from "../../src/theme/tokens";
import { blog, legal, projects, work } from "./content";

const id = () => crypto.randomUUID();
const heading = (text: string, level: 1 | 2 | 3 = 2): Block => ({ id: id(), type: "heading", text, level });
const text = (text: string): Block => ({ id: id(), type: "text", text });
const button = (label: string, href: string, variant: "primary" | "secondary" = "secondary"): Block => ({ id: id(), type: "button", label, href, variant });
const entries = (sections: string[][]): Block[] => sections.flatMap(([title, body]) => [...(title ? [heading(title)] : []), text(body!)]);
const column = (item: { title: string; text: string; meta: string; href?: string; tags?: string[] }): Column => ({ ...item, href: item.href ?? "", src: "", alt: "", linkLabel: "" });
const listing = (items: Column[], options: Partial<ColumnsBlock> = {}): ColumnsBlock => ({ id: id(), type: "columns", style: "list", items, ...options });

// Only seeds a fresh isolated database. Existing websites and repeat runs are refused.
export async function seedSeid({ db, pages, settings, media }: { db: Database; pages: PageStore; settings: SettingsStore; media: MediaStore }) {
  const count = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pages").get()!.count;
  if (count !== 1 || pages.get("home")?.title !== "Willkommen bei Theta" || pages.get("home")?.version !== 2 || media.list().length) {
    throw new Error("Die seid.dev-Demo benötigt eine frische Datenbank. Bestehende Inhalte werden nicht überschrieben.");
  }
  const portrait = await media.add(new File([await Bun.file(new URL("./portrait.webp", import.meta.url)).bytes()], "hamid-yosefsei.webp", { type: "image/webp" }));
  const author = "seid.dev Import";
  const publish = (page: Page, blocks: Block[], description = "", inNav = false) => pages.save(page.slug, { blocks: parseBlocks(blocks), description, inNav }, author, { action: "publish" });
  const projectPages = projects.map((project) => pages.create(project.title, author));
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i]!;
    publish(projectPages[i]!, [button("← Back to projects", "/projects"), text(project.date), heading(project.title, 1), text(project.summary), button(project.linkLabel, project.url, "primary"), ...entries(project.sections),
      ...(i > 0 ? [button(`← ${projects[i - 1]!.title}`, `/${projectPages[i - 1]!.slug}`)] : []),
      ...(i < projects.length - 1 ? [button(`${projects[i + 1]!.title} →`, `/${projectPages[i + 1]!.slug}`)] : []),
    ], project.summary);
  }
  const workPage = pages.create("Work", author);
  publish(workPage, [heading("Work", 1), listing(work.map(column), { style: "timeline" })], "Work history — software engineering, digitalization, interpretation, and computer science.", true);
  const projectsPage = pages.create("Projects", author);
  const projectCards = projects.map((project, i) => column({ title: project.title, text: project.summary, meta: project.date, tags: project.tags, href: `/${projectPages[i]!.slug}` }));
  publish(projectsPage, [heading("Projects", 1), text("Flagship products and open-source projects — powered by HyOS infrastructure."), listing(projectCards)], "Flagship products and open-source projects — powered by HyOS infrastructure.", true);
  const post = pages.create(blog.title, author, "post");
  publish(post, [heading(blog.title, 1), text(blog.summary), text(blog.text)], blog.summary);
  // A source import preserves the original publication date; normal CMS saves never backdate.
  db.query("UPDATE pages SET published_at = ? WHERE slug = ?").run("2026-03-08T12:00:00.000Z", post.slug);
  const terms = pages.create("Terms of Use", author);
  publish(terms, [heading("Terms of Use", 1), text("Last updated: Mar 08, 2026"), ...entries(legal.terms)]);
  const privacy = pages.create("Privacy Policy", author);
  publish(privacy, [heading("Privacy Policy", 1), text("Last updated: Mar 08, 2026"), ...entries(legal.privacy)]);
  settings.saveSite({ name: "Hamid Yosefsei", language: "en", description: "Software engineer & founder. Privacy-first products and infrastructure for the German market.", logo: "", imprint: terms.slug, privacy: privacy.slug,
    footer: "Infrastructure powered by [hyos.tech](https://hyos.tech)\n\n[Email](mailto:hi@seid.dev) · [GitHub](https://github.com/Hamido212) · [LinkedIn](https://linkedin.com/in/hamid-yosefzai/)" });
  settings.saveTheme({ ...defaultTheme("portfolio"), colorScheme: "light" });
  publish(pages.get("home")!, [
    { id: id(), type: "hero", layout: "profile", eyebrow: "seid.dev | hyos.tech", highlight: "Hamid Yosefsei", title: "Hi, I'm Hamid Yosefsei. 👋", text: "Software engineer & founder. I build products with conviction and the infrastructure to run them— privacy-first, German-market focused, no bloat.", src: portrait.url, alt: "Hamid Yosefsei", links: [
      { label: "Email", href: "mailto:hi@seid.dev" }, { label: "GitHub", href: "https://github.com/Hamido212" }, { label: "LinkedIn", href: "https://linkedin.com/in/hamid-yosefzai/" }, { label: "RSS feed", href: "/blog/feed.xml" },
    ], buttons: [{ label: "View projects", href: "/projects" }, { label: "Contact me", href: "mailto:hi@seid.dev" }] },
    listing(projectCards.slice(0, 3), { heading: "Projects", href: "/projects", linkLabel: "all →" }),
    listing([column({ title: blog.title, meta: "Mar 08, 2026", text: "", href: `/blog/${post.slug}` })], { heading: "Writing", href: "/blog", linkLabel: "all →" }),
    text("I care about **clean architecture**, user-facing simplicity, and software that respects people — no dark patterns, no surveillance, no bloat.\n\nMy flagship products are [Brieffix](https://brieffix.de) (AI letter generator for German bureaucracy) and [Dolmetschernetz](https://dolmetschernetz.de) (Germany's interpreter marketplace)."),
    button("Work history →", "/work"),
  ], "Software engineer & founder. I build products with conviction and the infrastructure to run them— privacy-first, German-market focused, no bloat.");
  // Keep a meaningful title in the page manager and link previews.
  pages.save("home", { title: "Hamid Yosefsei — Software Engineer & Founder" }, author, { action: "publish" });
  db.query("INSERT INTO settings (key, value) VALUES ('seid_demo', ?)").run(JSON.stringify({ source: "https://seid.dev", importedAt: new Date().toISOString() }));
  return { portrait, projects: projectPages, work: workPage, post, terms, privacy };
}
