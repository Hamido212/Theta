import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { form, testSite } from "./helpers";

const photo = async () =>
  new File(
    [
      await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#c0392b" } })
        .jpeg()
        .withExif({ IFD0: { Artist: "Hamid", Copyright: "privat" } })
        .withMetadata({ orientation: 6 })
        .toBuffer(),
    ],
    "Urlaub am Meer.jpg",
    { type: "image/jpeg" },
  );

const upload = (files: File[]) => {
  const body = new FormData();
  for (const file of files) body.append("file", file);
  return { method: "POST", body, headers: { origin: "http://localhost" } };
};

describe("uploading", () => {
  test("photos are turned upright, stripped of metadata and get smaller copies", async () => {
    const { request, uploads } = await testSite({ login: true });
    const res = await request("/api/media", upload([await photo()]));
    expect(res.status).toBe(201);
    const [item] = (await res.json()) as { id: string; url: string; thumb: string; width: number; height: number; filename: string }[];

    expect(item!.filename).toBe("Urlaub am Meer.jpg");
    expect(item!.url).toBe(`/media/${item!.id}/original.jpg`);
    expect([item!.width, item!.height]).toEqual([1000, 2000]);
    expect(item!.thumb).toBe(`/media/${item!.id}/480.webp`);

    const stored = await sharp(join(uploads, item!.id, "original.jpg")).metadata();
    expect(stored.exif).toBeUndefined();
    expect(stored.orientation).toBeUndefined();
    for (const name of ["480.webp", "960.webp"]) expect(existsSync(join(uploads, item!.id, name))).toBe(true);
    expect(existsSync(join(uploads, item!.id, "1600.webp"))).toBe(false);
  });

  test("very large images are scaled down", async () => {
    const { media } = await testSite();
    const big = await sharp({ create: { width: 6000, height: 3000, channels: 3, background: "#fff" } }).png().toBuffer();
    const item = await media.add(new File([big], "gross.png"));
    expect([item.width, item.height]).toEqual([2560, 1280]);
  });

  test("files that are not usable images are refused", async () => {
    const { request, media } = await testSite({ login: true });
    const text = await request("/api/media", upload([new File(["hallo"], "notiz.txt")]));
    expect(text.status).toBe(400);
    expect(((await text.json()) as { error: string }).error).toContain("kein Bild");

    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'], "logo.svg");
    const svgRes = await request("/api/media", upload([svg]));
    expect(svgRes.status).toBe(400);
    expect(media.list()).toHaveLength(0);
  });

  test("uploading needs a login", async () => {
    const { request, auth } = await testSite();
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    expect((await request("/api/media", upload([await photo()]))).status).toBe(401);
    expect((await request("/api/media")).status).toBe(401);
  });

  test("the library page uploads without JavaScript", async () => {
    const { request, media } = await testSite({ login: true });
    const res = await request("/admin/media", upload([await photo(), await photo()]));
    expect(res.status).toBe(302);
    expect(media.list()).toHaveLength(2);
    expect(await (await request("/admin/media")).text()).toContain("Urlaub am Meer.jpg");
  });
});

describe("serving", () => {
  test("uploaded files are cached for a long time; other paths are not served", async () => {
    const { request, media } = await testSite();
    const item = await media.add(await photo());
    const res = await request(item.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect((await request(`/media/${item.id}/960.webp`)).status).toBe(200);
    expect((await request(`/media/${item.id}/..%2F..%2Fpackage.json`)).status).toBe(404);
    expect((await request(`/media/${item.id}/123.webp`)).status).toBe(404);
    expect((await request("/media/unbekannt/original.jpg")).status).toBe(404);
  });

  test("pages use responsive sources and fixed sizes for uploaded images", async () => {
    const { request, pages, media } = await testSite();
    const item = await media.add(await photo());
    pages.save("home", { blocks: [{ id: "i", type: "image", src: item.url, alt: "Meer", caption: "", width: "normal" }] });
    pages.publish("home", true);
    const html = await (await request("/")).text();
    expect(html).toContain("srcSet=");
    expect(html).toContain(`/media/${item.id}/480.webp 480w, /media/${item.id}/960.webp 960w, ${item.url} 1000w`);
    expect(html).toContain('width="1000" height="2000"');
  });
});

test("deletion preserves referenced images and removes only unused files", async () => {
  const { request, pages, media, uploads } = await testSite({ login: true });
  const item = await media.add(await photo());
  pages.save("home", { blocks: [{ id: "g", type: "gallery", images: [{ src: item.url, alt: "" }], columns: 3, crop: true }] });
  expect(await (await request("/admin/media")).text()).toContain("Verwendet auf: Willkommen bei Theta");

  const res = await request(`/admin/media/${item.id}/delete`, form({}));
  expect(res.status).toBe(400);
  expect(media.list()).toHaveLength(1);
  expect(existsSync(join(uploads, item.id))).toBe(true);
  const unused = await media.add(await photo());
  expect((await request(`/admin/media/${unused.id}/delete`, form({}))).status).toBe(302);
  expect(existsSync(join(uploads, unused.id))).toBe(false);
});
