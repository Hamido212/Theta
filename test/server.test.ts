import { beforeEach, expect, test } from "bun:test";
import type { PageStore } from "../src/store";
import { testSite } from "./helpers";

let request: Awaited<ReturnType<typeof testSite>>["request"];
let pages: PageStore;

beforeEach(async () => {
  ({ request, pages } = await testSite({ login: true }));
});

const put = (body: unknown, slug = "home") =>
  request(`/api/pages/${slug}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: pages.get(slug)?.version, ...(body as object) }),
  });

test("a fresh site has a home page with three blocks", async () => {
  const res = await request("/");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Willkommen bei Theta");
  expect(pages.get("home")!.blocks.map((b) => b.type)).toEqual(["heading", "text", "image"]);
});

test("saving keeps the live page unchanged until explicit publication", async () => {
  const res = await put({ blocks: [{ id: "a", type: "heading", text: "Neu gespeichert" }] });
  expect(res.status).toBe(200);
  expect(pages.get("home")!.blocks).toEqual([{ id: "a", type: "heading", text: "Neu gespeichert", level: 1 }]);
  expect(await (await request("/")).text()).not.toContain("Neu gespeichert");
  const published = await put({ action: "publish", blocks: pages.get("home")!.blocks });
  expect(published.status).toBe(200);
  expect(await (await request("/")).text()).toContain("Neu gespeichert");
});

test("invalid blocks are rejected with a readable error and nothing is saved", async () => {
  const before = pages.get("home");
  const res = await put({ blocks: [{ id: "a", type: "image", src: "javascript:alert(1)", alt: "" }] });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: string; block: number };
  expect(body.error).toBe("Block 1 (Bild): Die Bild-Adresse muss mit https://, http:// oder / beginnen");
  expect(body.block).toBe(0);
  expect(pages.get("home")).toEqual(before);
});

test("unknown pages return 404", async () => {
  expect((await request("/api/pages/nope")).status).toBe(404);
  expect((await put({ blocks: [] }, "nope")).status).toBe(404);
});

test("the editor page and its bundle are served", async () => {
  const editor = await (await request("/edit")).text();
  expect(editor).toContain('id="theta-editor"');
  const js = await request("/assets/editor.js");
  expect(js.status).toBe(200);
  expect(js.headers.get("content-type")).toContain("javascript");
  expect((await js.text()).length).toBeGreaterThan(1000);
});

test("media files are served, paths outside the media folder are not", async () => {
  expect((await request("/media/theta.svg")).status).toBe(200);
  expect((await request("/media/..%2Fpackage.json")).status).toBe(404);
});
