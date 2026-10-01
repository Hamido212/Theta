import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseBlocks } from "../src/blocks";
import { exportSite } from "../src/export";
import { BlockView } from "../src/theme/blocks";
import { SocialIcon } from "../src/theme/icons";
import { TextField } from "../src/theme/fields";
import { seedSeid } from "../examples/seid/seed";
import { form, testSite } from "./helpers";

test("the editable portfolio validates metadata and rejects unsafe nested links", () => {
  const hero = { id: "h", type: "hero", layout: "profile", title: "Name", text: "Profile", src: "", alt: "", buttons: [], eyebrow: "domain | studio", links: [{ label: "Email", href: "mailto:hi@example.com", css: "unsafe" }] };
  const list = { id: "l", type: "columns", style: "list", heading: "Projects", href: "/projects", linkLabel: "all", items: [{ title: "Project", text: "Description", src: "", alt: "", href: "/project", meta: "2026", tags: ["TypeScript"] }] };
  const blocks = parseBlocks([hero, list]);
  expect(blocks[0]).toMatchObject({ layout: "profile", links: [{ label: "Email", href: "mailto:hi@example.com" }] });
  expect(blocks[1]).toMatchObject({ style: "list", items: [{ meta: "2026", tags: ["TypeScript"] }] });
  for (const invalid of [
    { ...hero, links: [{ label: "Unsafe", href: "javascript:alert(1)" }] },
    { ...list, href: "javascript:alert(1)" },
    { ...list, items: [{ ...list.items[0], tags: [42] }] },
    { ...list, items: [{ ...list.items[0], tags: Array(13).fill("Tag") }] },
  ]) expect(() => parseBlocks([invalid])).toThrow();
  const html = renderToStaticMarkup(<BlockView block={blocks[1]!} />);
  expect(html).toContain('href="/project"');
  expect(html).toContain("TypeScript");
  expect(renderToStaticMarkup(<SocialIcon href="https://" />)).toContain("<svg");
  const highlighted = renderToStaticMarkup(<TextField value="Hi <script>" highlight="<script>" />);
  expect(highlighted).toContain('<strong class="t-highlight">&lt;script&gt;</strong>');
  expect(highlighted).not.toContain("<script>");
});

test("the seid demo is a complete native website and cannot overwrite an existing site", async () => {
  const site = await testSite({ login: true });
  const imported = await seedSeid(site);
  expect(site.pages.publishedPages()).toHaveLength(9);
  expect(site.pages.posts()).toHaveLength(1);
  const home = await (await site.request("/")).text();
  expect(home).toContain('<html lang="en">');
  expect(home).toContain("Hi, I&#x27;m");
  expect(home).toContain('<strong class="t-highlight">Hamid Yosefsei</strong>');
  expect(home).toContain("t-profile");
  expect(home).not.toContain("<script");
  for (const path of ["/work", "/projects", "/brickssnap", "/amt-vernetzt", "/dolmetschernetz", "/brieffix", "/terms-of-use", "/privacy-policy", `/blog/${imported.post.slug}`]) {
    expect((await site.request(path)).status).toBe(200);
  }
  const feed = await (await site.request("/blog/feed.xml")).text();
  expect(feed).toContain("<language>en</language>");
  expect(feed).toContain("Sun, 08 Mar 2026");
  expect(await (await site.request("/blog")).text()).toContain("Mar 08, 2026");
  const before = site.pages.get("home");
  await expect(seedSeid(site)).rejects.toThrow("frische Datenbank");
  expect(site.pages.get("home")).toEqual(before);
  const live = site.pages.live("home");
  site.pages.save("home", { description: "Private draft" }, "Test");
  expect(site.pages.live("home")).toMatchObject({ title: live!.title, description: live!.description, blocks: live!.blocks });
  const files = await exportSite(site, "https://example.com");
  for (const file of ["index.html", "work/index.html", "projects/index.html", "brickssnap/index.html", "blog/index.html", "blog/more-posts-coming-soon/index.html", "licenses/atkinson-OFL.txt", "assets/fonts/atkinson-regular.woff", "assets/fonts/atkinson-bold.woff", imported.portrait.url.slice(1)]) expect(files.has(file)).toBe(true);
  expect(new TextDecoder().decode(files.get("index.html"))).not.toContain("Private draft");
  expect(new TextDecoder().decode(files.get("index.html"))).toContain("Hamid Yosefsei");
});

test("public language changes HTML and feed while leaving legacy German sites compatible", async () => {
  const site = await testSite({ login: true });
  expect(await (await site.request("/")).text()).toContain('<html lang="de">');
  expect((await site.request("/admin/site", form({ name: "English site", description: "", language: "en" }))).status).toBe(302);
  expect(await (await site.request("/")).text()).toContain('<html lang="en">');
  const before = site.settings.site();
  expect((await site.request("/admin/site", form({ name: "Invalid", description: "", language: "fr" }))).status).toBe(400);
  expect(site.settings.site()).toEqual(before);
});
