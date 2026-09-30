import { expect, spyOn, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type Block, type Page, parseBlocks } from "../src/blocks";
import { DraftWriter, type Draft } from "../src/editor/draft-writer";
import { blockRange, copyBlocks, duplicateBlocks, moveBlocks, removeBlocks, stepBlocks } from "../src/editor/sections";
import { BlockFlow, BlockView } from "../src/theme/blocks";
import { testSite } from "./helpers";

const page: Page = { slug: "test", kind: "page", title: "Alt", description: "", inNav: true, blocks: [], updatedAt: "2026-10-01", publishedAt: null, version: 1, hasChanges: true, deletedAt: null };

test("the default writer calls browser fetch without binding it to the writer", async () => {
  const implementation = Object.assign(function (this: unknown) {
    if (this instanceof DraftWriter) throw new TypeError("Illegal invocation");
    return Promise.resolve(Response.json({ ...page, title: "Neu", version: 2 }));
  }, { preconnect: fetch.preconnect });
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(implementation);
  try { expect((await new DraftWriter(page).save(() => ({ ...page, title: "Neu" }))).version).toBe(2); }
  finally { fetchSpy.mockRestore(); }
});

test("publication waits for autosave, then reads current edits with the returned version", async () => {
  let complete!: (response: Response) => void;
  const calls: Record<string, unknown>[] = [];
  const request = ((_: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); calls.push(body);
    if (calls.length === 1) return new Promise<Response>((resolve) => { complete = resolve; });
    return Promise.resolve(Response.json({ ...page, ...body, version: 3 }));
  });
  const writer = new DraftWriter(page, request);
  let current: Draft = { ...page, title: "Erster Text" };
  const autosave = writer.save(() => current, "save", true);
  current = { ...current, title: "Neuester Text" };
  const publication = writer.save(() => current, "publish");
  expect(calls).toHaveLength(1);
  complete(Response.json({ ...page, title: "Erster Text", version: 2 }));
  await Promise.all([autosave, publication]);
  expect(calls[1]).toMatchObject({ title: "Neuester Text", version: 2, action: "publish" });
  await writer.save(() => current);
  expect(calls).toHaveLength(2);
});

test("a conflict stops queued and subsequent writes while preserving local edits", async () => {
  let complete!: (response: Response) => void;
  let requests = 0;
  const request = () => { requests++; return new Promise<Response>((resolve) => { complete = resolve; }); };
  const writer = new DraftWriter(page, request);
  const current = { ...page, title: "Eigener Text" };
  const first = writer.save(() => current);
  const queued = writer.save(() => current, "publish");
  complete(Response.json({ error: "Anderer Tab" }, { status: 409 }));
  const results = await Promise.allSettled([first, queued]);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  await expect(writer.save(() => current)).rejects.toThrow();
  expect(requests).toBe(1);
  expect(current.title).toBe("Eigener Text");
  expect(writer.page.version).toBe(1);
});

test("a failed network save can be retried with the same version", async () => {
  let count = 0;
  const request = () => ++count === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(Response.json({ ...page, title: "Neu", version: 2 }));
  const writer = new DraftWriter(page, request);
  await expect(writer.save(() => ({ ...page, title: "Neu" }))).rejects.toThrow("offline");
  expect((await writer.save(() => ({ ...page, title: "Neu" }))).version).toBe(2);
});

test("section move, duplicate and removal include content and preserve adjacent sections", () => {
  const blocks: Block[] = [
    { id: "intro", type: "text", text: "Intro" },
    { id: "a", type: "section", background: "soft", width: "wide", spacing: "compact", align: "center" },
    { id: "a1", type: "text", text: "A" },
    { id: "a2", type: "text", text: "AA" },
    { id: "b", type: "section", background: "inverse" },
    { id: "b1", type: "text", text: "B" },
    { id: "c", type: "section", background: "plain" },
    { id: "c1", type: "text", text: "C" },
  ];
  const ids = (list: Block[]) => list.map((b) => b.id);
  expect(blockRange(blocks, 1)).toEqual([1, 4]);
  expect(ids(stepBlocks(blocks, 1, 1))).toEqual(["intro", "b", "b1", "a", "a1", "a2", "c", "c1"]);
  expect(ids(stepBlocks(blocks, 6, -1))).toEqual(["intro", "a", "a1", "a2", "c", "c1", "b", "b1"]);
  expect(ids(moveBlocks(blocks, 1, 5))).toEqual(["intro", "b", "b1", "a", "a1", "a2", "c", "c1"]);
  expect(ids(removeBlocks(blocks, 1))).toEqual(["intro", "b", "b1", "c", "c1"]);
  const duplicate = duplicateBlocks(blocks, 1);
  expect(duplicate).toHaveLength(11);
  expect(new Set(ids(duplicate)).size).toBe(11);
  expect(duplicate[4]).toMatchObject({ type: "section", width: "wide", spacing: "compact", align: "center" });
  const copy = copyBlocks(blocks);
  (copy[2] as { text: string }).text = "Unabhängig";
  expect(blocks[2]).toMatchObject({ text: "A" });
});

test("layout choices and focal points survive validation and shared rendering", () => {
  const blocks = parseBlocks([
    { id: "s", type: "section", background: "soft", width: "wide", spacing: "spacious", align: "center", css: "unsafe" },
    { id: "i", type: "image", src: "/media/photo.jpg", alt: "Foto", focal: { x: 0.2, y: 0.8, extra: "unsafe" } },
  ]);
  expect(blocks[0]).not.toHaveProperty("css");
  expect(blocks[1]).toMatchObject({ focal: { x: 0.2, y: 0.8 } });
  expect((blocks[1] as { focal: object }).focal).not.toHaveProperty("extra");
  const html = renderToStaticMarkup(<BlockFlow blocks={blocks}>{(block) => <BlockView block={block} />}</BlockFlow>);
  expect(html).toContain("t-band-width-wide t-band-spacing-spacious t-band-align-center");
  expect(html).toContain("object-position:20% 80%");
  for (const focal of [{ x: -0.1, y: 0.5 }, { x: 0.5, y: 1.1 }, { x: Infinity, y: 0 }, { x: "0.5", y: 0.5 }]) {
    expect(() => parseBlocks([{ id: "i", type: "image", src: "", alt: "", focal }])).toThrow();
  }
});

test("own section templates validate groups, require login and insert independent copies", async () => {
  const { app, request } = await testSite({ login: true });
  expect((await app.request("/api/section-templates")).status).toBe(401);
  const post = (blocks: unknown) => request("/api/section-templates", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ title: "Unser Angebot", blocks }) });
  expect((await post([{ id: "a", type: "text", text: "Kein Abschnitt" }])).status).toBe(400);
  expect((await post([{ id: "s", type: "section" }, { id: "s2", type: "section" }])).status).toBe(400);
  const response = await post([{ id: "s", type: "section", background: "soft", spacing: "compact" }, { id: "t", type: "text", text: "Angebot" }]);
  expect(response.status).toBe(201);
  const template = await response.json() as { id: string; title: string; blocks: Block[] };
  const first = copyBlocks(template.blocks), second = copyBlocks(template.blocks);
  expect(first[0]!.id).not.toBe(second[0]!.id);
  expect(first[0]).toMatchObject({ spacing: "compact" });
  expect(await (await request("/api/section-templates")).json()).toHaveLength(1);
  expect((await request(`/api/section-templates/${template.id}`, { method: "DELETE", headers: { origin: "http://localhost" } })).status).toBe(200);
  expect(await (await request("/api/section-templates")).json()).toEqual([]);
});
