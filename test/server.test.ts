import { beforeEach, expect, test } from "bun:test";
import { createApp } from "../src/server";
import { PageStore } from "../src/store";

let app: ReturnType<typeof createApp>;
let store: PageStore;

beforeEach(() => {
  store = new PageStore(":memory:");
  app = createApp(store);
});

const put = (body: unknown) =>
  app.request("/api/pages/home", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("a fresh site has a home page with three blocks", async () => {
  const res = await app.request("/");
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("Willkommen bei Theta");
  expect(store.get("home")!.blocks.map((b) => b.type)).toEqual(["heading", "text", "image"]);
});

test("saving blocks persists them and updates the public page", async () => {
  const res = await put({ blocks: [{ id: "a", type: "heading", text: "Neu gespeichert" }] });
  expect(res.status).toBe(200);
  expect(store.get("home")!.blocks).toEqual([{ id: "a", type: "heading", text: "Neu gespeichert" }]);
  expect(await (await app.request("/")).text()).toContain("Neu gespeichert");
});

test("invalid blocks are rejected with a readable error and nothing is saved", async () => {
  const before = store.get("home");
  const res = await put({ blocks: [{ id: "a", type: "image", src: "javascript:alert(1)", alt: "" }] });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toContain("src");
  expect(store.get("home")).toEqual(before);
});

test("unknown pages return 404", async () => {
  expect((await app.request("/api/pages/nope")).status).toBe(404);
  const res = await app.request("/api/pages/nope", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blocks: [] }),
  });
  expect(res.status).toBe(404);
});

test("the editor page and its bundle are served", async () => {
  expect(await (await app.request("/edit")).text()).toContain('id="theta-editor"');
  const js = await app.request("/assets/editor.js");
  expect(js.status).toBe(200);
  expect(js.headers.get("content-type")).toContain("javascript");
  expect((await js.text()).length).toBeGreaterThan(1000);
});

test("media files are served, paths outside the media folder are not", async () => {
  expect((await app.request("/media/theta.svg")).status).toBe(200);
  expect((await app.request("/media/..%2Fpackage.json")).status).toBe(404);
});
