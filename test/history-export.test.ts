import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { exportSite, writeFiles } from "../src/export";
import { form, testSite } from "./helpers";

describe("history", () => {
  test("every save keeps a version with its author", async () => {
    const { pages } = await testSite();
    const page = pages.create("Kontakt", "Hamid");
    pages.save(page.slug, { blocks: [{ id: "a", type: "text", text: "Version 2" }] }, "Hamid");
    pages.save(page.slug, { title: "Kontakt & Anfahrt", blocks: [{ id: "a", type: "text", text: "Version 3" }] }, "Lea");

    const list = pages.revisions(page.slug);
    expect(list.map((r) => [r.title, r.author])).toEqual([
      ["Kontakt & Anfahrt", "Lea"],
      ["Kontakt", "Hamid"],
      ["Kontakt", "Hamid"],
    ]);
    const second = pages.revision(page.slug, list[1]!.id)!;
    expect(second.blocks).toEqual([{ id: "a", type: "text", text: "Version 2" }]);
    expect(pages.revision("home", list[1]!.id)).toBeNull();
  });

  test("only the newest 50 versions are kept, and they survive in the trash", async () => {
    const { pages } = await testSite();
    const { slug } = pages.create("Viel bearbeitet");
    for (let i = 0; i < 60; i++) pages.save(slug, { blocks: [{ id: "a", type: "text", text: `Stand ${i}` }] });
    const list = pages.revisions(slug);
    expect(list).toHaveLength(50);
    expect(pages.revision(slug, list[0]!.id)!.blocks[0]).toMatchObject({ text: "Stand 59" });
    pages.delete(slug);
    expect(pages.revisions(slug)).toHaveLength(50);
    expect(pages.trash()[0]!.slug).toBe(slug);
  });

  test("the API lists and returns versions for logged-in users only", async () => {
    const { request, pages } = await testSite({ login: true });
    const put = await request("/api/pages/home", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: pages.get("home")!.version, blocks: [{ id: "a", type: "heading", text: "Neu" }] }),
    });
    expect(put.status).toBe(200);
    const list = (await (await request("/api/pages/home/revisions")).json()) as { id: number; author: string }[];
    expect(list[0]!.author).toBe("Test");
    const revision = (await (await request(`/api/pages/home/revisions/${list[0]!.id}`)).json()) as { blocks: unknown[] };
    expect(revision.blocks).toEqual([{ id: "a", type: "heading", text: "Neu", level: 1 }]);
    expect((await request("/api/pages/home/revisions/999999")).status).toBe(404);
    expect((await request("/api/pages/nope/revisions")).status).toBe(404);
    expect(pages.revisions("home")).toHaveLength(1);
  });
});

describe("static export", () => {
  const upload = async (color: string) =>
    new File([await sharp({ create: { width: 1200, height: 800, channels: 3, background: color } }).jpeg().toBuffer()], "foto.jpg");

  test("produces every page, the theme and exactly the images in use", async () => {
    const { pages, settings, media } = await testSite();
    settings.saveSite({ name: "Bäckerei Sonne", description: "" });
    const used = await media.add(await upload("#f00"));
    const unused = await media.add(await upload("#00f"));
    const about = pages.create("Über uns");
    pages.save(about.slug, { blocks: [{ id: "i", type: "image", src: used.url, alt: "Laden", caption: "", width: "normal" }] });

    pages.publish(about.slug, true);
    const files = await exportSite({ pages, settings, media }, "https://baeckerei-sonne.de");
    const names = [...files.keys()].sort();
    expect(names).toEqual(
      [
        "404.html",
        "assets/theme.css",
        "index.html",
        "media/theta.svg",
        "media/favicon.svg",
        `media/${used.id}/480.webp`,
        `media/${used.id}/960.webp`,
        `media/${used.id}/original.jpg`,
        "robots.txt",
        "sitemap.xml",
        "ueber-uns/index.html",
      ].sort(),
    );
    expect(names.some((name) => name.includes(unused.id))).toBe(false);

    const html = new TextDecoder().decode(files.get("ueber-uns/index.html"));
    expect(html).toContain('<link rel="canonical" href="https://baeckerei-sonne.de/ueber-uns"/>');
    expect(html).toContain("--t-color-accent");
    expect(html).not.toContain("<script");
    expect(new TextDecoder().decode(files.get("sitemap.xml"))).toContain("https://baeckerei-sonne.de/ueber-uns");
  });

  test("writes the files to a folder", async () => {
    const site = await testSite();
    const dir = mkdtempSync(join(tmpdir(), "theta-export-"));
    await writeFiles(await exportSite(site, "https://example.com"), dir);
    expect(readFileSync(join(dir, "index.html"), "utf8")).toContain("Willkommen bei Theta");
    expect(readFileSync(join(dir, "assets/theme.css"), "utf8")).toContain(".t-page");
  });

  test("the overview offers the site as a valid ZIP", async () => {
    const { request } = await testSite({ login: true });
    const res = await request("/admin/export", form({ url: "https://example.com/ignored/path" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="meine-website-website.zip"');

    const archive = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(strFromU8(archive["index.html"]!)).toContain("Willkommen bei Theta");
    expect(strFromU8(archive["assets/theme.css"]!)).toContain(".t-page");

    const bad = await request("/admin/export", form({ url: "javascript:alert(1)" }));
    expect(bad.status).toBe(400);
  });
});
