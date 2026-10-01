import { expect, test } from "bun:test";
import sharp from "sharp";
import { type Block, parseBlocks } from "../src/blocks";
import { fromClipboard, replaceImage, toClipboard } from "../src/editor/clipboard";
import { exportSite } from "../src/export";
import { liveContent, withLayoutRules } from "../src/shared-sections";
import { form, testSite } from "./helpers";

// Ideas borrowed from page builders like Bricks: components with props, hiding, copy and
// paste between sites, layout rules and a self-updating list of posts.

const section = (props?: string[]): Block => ({ id: "band", type: "section", background: "accent", ...(props && { props }) });
const component = (props?: string[]): Block[] => [
  section(props),
  { id: "title", type: "heading", text: "Zentraler Titel", level: 2 },
  { id: "body", type: "text", text: "Zentraler Text" },
  { id: "cta", type: "button", label: "Anfragen", href: "/kontakt", variant: "primary" },
];
const text = (body: string, id = "t"): Block => ({ id, type: "text", text: body });
const json = (body: unknown, method = "POST") => ({ method, headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body) });

test("pages fill in only the fields their shared section offers", async () => {
  const site = await testSite();
  const shared = site.pages.createShared("Aufruf", component(["title", "cta"]));
  site.pages.publish(shared.slug, true);
  const page = site.pages.create("Leistungen");
  site.pages.save(page.slug, { blocks: [{ id: "ref", type: "shared", sectionId: shared.slug, overrides: {
    title: { text: "Eigener Titel" },
    cta: { label: "Jetzt buchen", href: "/buchen" },
    // Not offered by the section, so the central text stays.
    body: { text: "Darf nicht erscheinen" },
  } }] });
  site.pages.publish(page.slug, true);
  const html = await (await site.app.request(`/${page.slug}`)).text();
  expect(html).toContain("Eigener Titel");
  expect(html).toContain("Jetzt buchen");
  expect(html).toContain('href="/buchen"');
  expect(html).toContain("Zentraler Text");
  expect(html).not.toContain("Darf nicht erscheinen");
  expect(html).not.toContain("Zentraler Titel");

  // Another page without overrides keeps the central content.
  const other = site.pages.create("Über uns");
  site.pages.save(other.slug, { blocks: [{ id: "ref", type: "shared", sectionId: shared.slug }] });
  site.pages.publish(other.slug, true);
  expect(await (await site.app.request(`/${other.slug}`)).text()).toContain("Zentraler Titel");

  // When the centre stops offering a field, the page's own value no longer shows.
  site.pages.save(shared.slug, { blocks: component(["cta"]) });
  site.pages.publish(shared.slug, true);
  const after = await (await site.app.request(`/${page.slug}`)).text();
  expect(after).toContain("Zentraler Titel");
  expect(after).toContain("Jetzt buchen");
});

test("page values cannot carry unsafe links, layout or unknown fields", () => {
  const ref = (overrides: unknown) => [{ id: "ref", type: "shared", sectionId: "aufruf", overrides }];
  expect(() => parseBlocks(ref({ cta: { href: "javascript:alert(1)" } }))).toThrow();
  expect(() => parseBlocks(ref({ photo: { src: "data:image/png;base64,AAAA" } }))).toThrow();
  expect(() => parseBlocks(ref({ title: { text: 5 } }))).toThrow();
  expect(() => parseBlocks(ref([]))).toThrow();
  const [block] = parseBlocks(ref({ title: { text: "Hallo", level: 1, background: "inverse" } }));
  expect(block).toEqual({ id: "ref", type: "shared", sectionId: "aufruf", overrides: { title: { text: "Hallo" } } });
  expect(parseBlocks([{ ...section(["a", "b"]), id: "s" }])[0]).toMatchObject({ props: ["a", "b"] });
});

test("hidden blocks and sections stay in the draft but never reach visitors", async () => {
  const site = await testSite();
  const page = site.pages.create("Angebot");
  site.pages.save(page.slug, { blocks: [
    text("Sichtbar", "a"),
    { ...text("Versteckter Block", "b"), hidden: true },
    { id: "s1", type: "section", background: "soft", hidden: true },
    text("Im versteckten Abschnitt", "c"),
    { id: "s2", type: "section", background: "plain" },
    text("Nächster Abschnitt", "d"),
  ] as Block[] });
  expect(site.pages.get(page.slug)!.blocks[1]).toMatchObject({ hidden: true });
  site.pages.publish(page.slug, true);
  const html = await (await site.app.request(`/${page.slug}`)).text();
  expect(html).toContain("Sichtbar");
  expect(html).toContain("Nächster Abschnitt");
  expect(html).not.toContain("Versteckter Block");
  expect(html).not.toContain("Im versteckten Abschnitt");
  const files = await exportSite(site, "https://theta.test");
  expect(new TextDecoder().decode(files.get(`${page.slug}/index.html`))).not.toContain("Versteckter Block");
  // hidden: false is not stored at all.
  expect(parseBlocks([{ ...text("x"), hidden: false }])[0]).toEqual(text("x"));
});

test("a hidden contact form does not accept messages", async () => {
  const site = await testSite();
  const page = site.pages.create("Kontakt");
  site.pages.save(page.slug, { blocks: [{ id: "f", type: "form", button: "Senden", success: "Danke", phone: false, hidden: true }] as Block[] });
  site.pages.publish(page.slug, true);
  const response = await site.app.request(`/${page.slug}`, form({ _form: "f", name: "A", email: "a@example.com", message: "Hallo" }));
  expect(response.status).toBe(404);
});

test("layout rules show a shared section on every post, once, and only when it is live", async () => {
  const site = await testSite({ login: true });
  const box = site.pages.createShared("Autorenbox", [section(), text("Geschrieben von Hamid", "who")]);
  const post = site.pages.create("Erster Beitrag", "", "post");
  site.pages.save(post.slug, { blocks: [{ id: "h", type: "heading", text: "Erster Beitrag", level: 1 }, text("Inhalt des Beitrags", "c")] });
  site.pages.publish(post.slug, true);
  const page = site.pages.create("Leistungen");
  site.pages.publish(page.slug, true);

  const set = await site.request(`/admin/shared-sections/${box.slug}/rule`, form({ place: "posts-end" }));
  expect(set.status).toBe(302);
  expect(site.settings.layoutRules()).toEqual([{ sectionId: box.slug, place: "posts-end" }]);
  // Not published yet: nothing appears.
  expect(await (await site.app.request(`/blog/${post.slug}`)).text()).not.toContain("Geschrieben von Hamid");

  site.pages.publish(box.slug, true);
  const html = await (await site.app.request(`/blog/${post.slug}`)).text();
  expect(html).toContain("Geschrieben von Hamid");
  expect(html.indexOf("Inhalt des Beitrags")).toBeLessThan(html.indexOf("Geschrieben von Hamid"));
  expect(await (await site.app.request(`/${page.slug}`)).text()).not.toContain("Geschrieben von Hamid");
  const files = await exportSite(site, "https://theta.test");
  expect(new TextDecoder().decode(files.get(`blog/${post.slug}/index.html`))).toContain("Geschrieben von Hamid");

  // A post that embeds the box by hand shows it once.
  site.pages.save(post.slug, { blocks: [{ id: "h", type: "heading", text: "Erster Beitrag", level: 1 }, { id: "r", type: "shared", sectionId: box.slug }, text("Inhalt des Beitrags", "c")] });
  site.pages.publish(post.slug, true);
  expect((await (await site.app.request(`/blog/${post.slug}`)).text()).split("Geschrieben von Hamid").length).toBe(2);

  // At the start, the box goes below the title.
  site.settings.saveLayoutRule(box.slug, "posts-start");
  const blocks = withLayoutRules({ kind: "post", blocks: [{ id: "h", type: "heading", text: "T", level: 1 }, text("x", "c")] }, site.settings.layoutRules(), { [box.slug]: [] });
  expect(blocks.map((block) => block.id)).toEqual(["h", `rule-${box.slug}`, "c"]);

  site.settings.saveLayoutRule(box.slug, "");
  expect(site.settings.layoutRules()).toEqual([]);
  expect((await site.request(`/admin/shared-sections/${box.slug}/rule`, form({ place: "überall" }))).status).toBe(400);
  expect((await site.request(`/admin/shared-sections/${page.slug}/rule`, form({ place: "posts-end" }))).status).toBe(400);
  expect(site.settings.layoutRules()).toEqual([]);
});

test("rules for pages leave posts and shared sections alone", () => {
  const rules = [{ sectionId: "footer-cta", place: "pages-end" as const }];
  const shared = { "footer-cta": [section(), text("Ruf uns an")] };
  expect(liveContent({ kind: "page", blocks: [text("Seite")] }, { sharedSections: shared, layoutRules: rules }).map((block) => block.id)).toEqual(["t", "rule-footer-cta-band", "rule-footer-cta-t"]);
  expect(liveContent({ kind: "post", blocks: [text("Beitrag")] }, { sharedSections: shared, layoutRules: rules })).toHaveLength(1);
  expect(liveContent({ kind: "section", blocks: [text("Zentral")] }, { sharedSections: shared, layoutRules: [{ sectionId: "footer-cta", place: "all-end" }] })).toHaveLength(1);
});

test("the newest posts block lists published posts, newest first, without the current one", async () => {
  const site = await testSite();
  const titles = ["Alt", "Mittel", "Neu"];
  for (const title of titles) {
    const post = site.pages.create(title, "", "post");
    site.pages.save(post.slug, { blocks: [text(`Über ${title}`)] });
    site.pages.publish(post.slug, true);
    await Bun.sleep(5);
  }
  site.pages.create("Entwurf", "", "post");
  const home = site.pages.get("home")!;
  site.pages.save("home", { blocks: [...home.blocks, { id: "latest", type: "posts", count: 2, style: "cards" }] });
  site.pages.publish("home", true);
  const html = await (await site.app.request("/")).text();
  expect(html).toContain('href="/blog/neu"');
  expect(html).toContain('href="/blog/mittel"');
  expect(html).not.toContain('href="/blog/alt"');
  expect(html).not.toContain("Entwurf");
  expect(html.indexOf("/blog/neu")).toBeLessThan(html.indexOf("/blog/mittel"));

  site.pages.save("neu", { blocks: [text("Neu"), { id: "more", type: "posts", count: 3, style: "list" }] });
  site.pages.publish("neu", true);
  const post = await (await site.app.request("/blog/neu")).text();
  expect(post).toContain("t-latest-list");
  expect(post).not.toContain('href="/blog/neu"');
  expect(post).toContain('href="/blog/alt"');

  const files = await exportSite(site, "https://theta.test");
  expect(new TextDecoder().decode(files.get("index.html"))).toContain('href="/blog/neu"');
  expect(parseBlocks([{ id: "p", type: "posts", count: 99, style: "grid" }])[0]).toEqual({ id: "p", type: "posts", count: 3, style: "cards" });
});

test("copied blocks travel to another site with full picture addresses", () => {
  const blocks: Block[] = [section(), { id: "img", type: "image", src: "/media/abc123/original.webp", alt: "Team", caption: "", width: "normal" }, { id: "ref", type: "shared", sectionId: "aufruf", overrides: { title: { text: "Eigen" } } }];
  const shared = [{ page: { slug: "aufruf" } as never, liveBlocks: component(["title"]), usage: [] }];
  const text = toClipboard(blocks, shared, "https://alt.example");
  expect(text).toContain('"https://alt.example/media/abc123/original.webp"');

  const pasted = fromClipboard(text, "https://neu.example")!;
  expect(pasted.images).toEqual(["https://alt.example/media/abc123/original.webp"]);
  // Shared sections arrive as independent copies with this page's own values, and fresh ids.
  expect(pasted.blocks.map((block) => block.type)).toEqual(["section", "image", "section", "heading", "text", "button"]);
  expect(pasted.blocks.some((block) => block.type === "section" && block.props)).toBe(false);
  expect(pasted.blocks.find((block) => block.type === "heading")).toMatchObject({ text: "Eigen" });
  expect(pasted.blocks.some((block) => block.id === "img")).toBe(false);
  const moved = replaceImage(pasted.blocks, pasted.images[0]!, "/media/new/original.webp");
  expect(moved[1]).toMatchObject({ src: "/media/new/original.webp" });

  // Pasting on the same site keeps short addresses and copies no pictures.
  const same = fromClipboard(text, "https://alt.example")!;
  expect(same.images).toEqual([]);
  expect(same.blocks[1]).toMatchObject({ src: "/media/abc123/original.webp" });

  expect(fromClipboard("Einfach nur Text", "https://neu.example")).toBeNull();
  expect(fromClipboard('{"theta-blocks":2}', "https://neu.example")).toBeNull();
  expect(() => fromClipboard('{"theta-blocks":1,"origin":"x","blocks":[{"id":"a","type":"zauber"}]}', "https://neu.example")).toThrow("passen nicht");
});

test("pictures from another Theta site are copied into the media library", async () => {
  const pixels = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#176b66" } }).png().toBuffer();
  const asked: string[] = [];
  const site = await testSite();
  const { createApp } = await import("../src/server");
  const app = createApp({ pages: site.pages, settings: site.settings, media: site.media, auth: site.auth, download: (async (url: URL) => {
    asked.push(String(url));
    return url.pathname.includes("missing") ? new Response("", { status: 404 }) : new Response(pixels);
  }) as typeof fetch });
  const { token } = site.auth.createSession((await site.auth.createUser({ email: "zwei@example.com", name: "Zwei", password: "richtig-geheim" })).id);
  const request = (body: unknown) => app.request("/api/media/import", { ...json(body), headers: { ...json(body).headers, cookie: `theta_session=${token}` } });

  const ok = await request({ url: "https://alt.example/media/abc123/original.png" });
  expect(ok.status).toBe(201);
  const item = await ok.json() as { url: string };
  expect(item.url).toMatch(/^\/media\//);
  expect(site.media.list()).toHaveLength(1);
  expect((await request({ url: "https://alt.example/media/missing/original.png" })).status).toBe(400);
  for (const url of ["http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "https://alt.example/admin", "nicht einmal eine Adresse"]) {
    expect((await request({ url })).status).toBe(400);
  }
  expect(asked).toEqual(["https://alt.example/media/abc123/original.png", "https://alt.example/media/missing/original.png"]);
  expect((await app.request("/api/media/import", json({ url: "https://alt.example/media/a/b.png" }))).status).toBe(401);
});
