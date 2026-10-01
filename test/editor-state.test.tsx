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

test("a stalled save releases the queue, aborts and ignores its late confirmation", async () => {
  let finish!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  let calls = 0;
  const writer = new DraftWriter(page, async (_, init) => {
    calls++; signal = init.signal as AbortSignal;
    if (calls === 1) return new Promise<Response>((resolve) => { finish = resolve; });
    return Response.json({ ...page, title: "Neu", version: 2 });
  }, 15);
  const before = writer.savedKey;
  const saving = writer.save(() => ({ ...page, title: "Alt und unbestätigt" }));
  const queued = writer.save(() => ({ ...page, title: "Neu" }), "publish");
  const results = await Promise.allSettled([saving, queued]);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  expect(signal!.aborted).toBe(true);
  expect(writer.savedKey).toBe(before);
  finish(Response.json({ ...page, title: "Alt und unbestätigt", version: 99 }));
  await Promise.resolve(); await Promise.resolve();
  expect(writer.page.version).toBe(1);
  expect((await writer.save(() => ({ ...page, title: "Neu" }))).version).toBe(2);
});

test("a stalled response body cannot leave saving pending forever", async () => {
  const res = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"slug":')); } }));
  const writer = new DraftWriter(page, async () => res, 15);
  await expect(writer.save(() => ({ ...page, title: "Neu" }))).rejects.toThrow("nicht geantwortet");
  expect(writer.page).toEqual(page);
  expect(writer.savedKey).toBe(new DraftWriter(page).savedKey);
});

test("retrying an unconfirmed committed write preserves version conflict protection", async () => {
  const site = await testSite({ login: true });
  const original = site.pages.create("Timeout-Test");
  let calls = 0;
  const writer = new DraftWriter(original, async (url, init) => {
    const response = await site.request(url, init);
    if (++calls === 1) return new Promise<Response>(() => {});
    return response;
  }, 150);
  await expect(writer.save(() => ({ ...original, title: "Vom Server angenommen" }))).rejects.toThrow("nicht geantwortet");
  expect(site.pages.get(original.slug)!.title).toBe("Vom Server angenommen");
  await expect(writer.save(() => ({ ...original, title: "Weitere lokale Eingabe" }))).rejects.toThrow("inzwischen geändert");
  expect(writer.conflict).toBe(true);
  expect(site.pages.get(original.slug)!.title).toBe("Vom Server angenommen");
});

test("restoring history preserves autosaved and unsaved drafts without changing the live copy", async () => {
  const { pages, request } = await testSite({ login: true });
  const created = pages.create("Ursprünglich", "Test");
  const target = pages.revision(created.slug, pages.revisions(created.slug)[0]!.id)!;
  pages.save(created.slug, { blocks: [{ id: "live", type: "text", text: "Live-Fassung" }] }, "Test");
  pages.publish(created.slug, true);
  const original = pages.get(created.slug)!;
  const writer = new DraftWriter(original, async (url, init) => request(url, init));
  let current: Draft = { ...original, title: "Autosave vor Wiederherstellung" };
  await writer.save(() => current, "save", true);
  current = { ...current, title: "Noch nicht gesicherte letzte Eingabe" };
  const restored = { title: target.title, description: target.description, inNav: target.inNav, blocks: target.blocks };
  const result = await writer.restore(() => current, restored);
  expect(result).toMatchObject({ title: "Ursprünglich", blocks: target.blocks, hasChanges: true });
  expect(pages.revisions(created.slug).map((r) => r.title)).toEqual([
    "Ursprünglich", "Noch nicht gesicherte letzte Eingabe", "Autosave vor Wiederherstellung", "Ursprünglich", "Ursprünglich",
  ]);
  expect(pages.live(created.slug)!.blocks).toEqual([{ id: "live", type: "text", text: "Live-Fassung" }]);
  // Further typing must not replace the restored checkpoint.
  await writer.save(() => ({ ...restored, title: "Nach Wiederherstellung" }), "save", true);
  expect(pages.revisions(created.slug)[1]!.title).toBe("Ursprünglich");
});

test("restoring an already autosaved draft retains that checkpoint", async () => {
  const { pages, request } = await testSite({ login: true });
  const created = pages.create("Anfang", "Test");
  const writer = new DraftWriter(created, async (url, init) => request(url, init));
  const current: Draft = { ...created, title: "Jüngster Autosave" };
  await writer.save(() => current, "save", true);
  await writer.restore(() => current, created);
  expect(pages.revisions(created.slug).map((r) => r.title)).toEqual(["Anfang", "Jüngster Autosave", "Anfang"]);
});

test("queued publication cannot run between preserving and restoring a draft", async () => {
  let finishFirst!: (response: Response) => void;
  let finishSecond!: (response: Response) => void;
  let notifySecond!: () => void;
  const secondStarted = new Promise<void>((resolve) => { notifySecond = resolve; });
  const calls: Record<string, unknown>[] = [];
  const target: Draft = { ...page, title: "Historische Fassung" };
  const request = (_: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); calls.push(body);
    if (calls.length === 1) return new Promise<Response>((resolve) => { finishFirst = resolve; });
    if (calls.length === 2) { notifySecond(); return new Promise<Response>((resolve) => { finishSecond = resolve; }); }
    return Promise.resolve(Response.json({ ...page, ...target, version: 4 }));
  };
  const writer = new DraftWriter(page, request);
  const restoring = writer.restore(() => ({ ...page, title: "Ungesicherter Text" }), target);
  const publishing = writer.save(() => target, "publish");
  finishFirst(Response.json({ ...page, title: "Ungesicherter Text", version: 2 }));
  await secondStarted;
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ title: "Historische Fassung", action: "save", autosave: false, version: 2 });
  finishSecond(Response.json({ ...page, ...target, version: 3 }));
  await Promise.all([restoring, publishing]);
  expect(calls[2]).toMatchObject({ action: "publish", version: 3 });
});

test("failed preservation stops restoration and leaves local content available", async () => {
  let calls = 0;
  const writer = new DraftWriter(page, async () => { calls++; return Response.json({ error: "Veralteter Stand" }, { status: 409 }); });
  const current: Draft = { ...page, title: "Eigene Änderungen" };
  await expect(writer.restore(() => current, { ...page, title: "Historisch" })).rejects.toThrow("Veralteter Stand");
  expect(calls).toBe(1);
  expect(current.title).toBe("Eigene Änderungen");
  expect(writer.page).toEqual(page);
});

test("an unconfirmed or malformed success response never marks the local draft as saved", async () => {
  for (const response of [new Response("<html>Proxy-Fehler</html>"), Response.json({ ok: true }),
    Response.json({ ...page, slug: "andere-seite" }), Response.json({ ...page, version: 0 }),
    Response.json({ ...page, kind: "post" }), Response.json({ ...page, blocks: [null] })]) {
    const writer = new DraftWriter(page, async () => response);
    const before = writer.savedKey;
    await expect(writer.save(() => ({ ...page, title: "Ungesicherter Text" }))).rejects.toThrow("nicht bestätigt");
    expect(writer.page).toEqual(page);
    expect(writer.savedKey).toBe(before);
    expect(writer.conflict).toBe(false);
  }
});

test("a failed restoration keeps its successful checkpoint and retries with the new version", async () => {
  const calls: Record<string, unknown>[] = [];
  const current: Draft = { ...page, title: "Eigene Änderungen" };
  const target: Draft = { ...page, title: "Historische Fassung" };
  const writer = new DraftWriter(page, async (_, init) => {
    const body = JSON.parse(String(init.body)); calls.push(body);
    if (calls.length === 2) throw new Error("offline");
    return Response.json({ ...page, ...body, version: calls.length === 1 ? 2 : 3 });
  });
  await expect(writer.restore(() => current, target)).rejects.toThrow("offline");
  expect(writer.page).toMatchObject({ title: current.title, version: 2 });
  expect(current.title).toBe("Eigene Änderungen");
  expect((await writer.restore(() => current, target)).title).toBe(target.title);
  expect(calls).toHaveLength(3);
  expect(calls[2]).toMatchObject({ title: target.title, version: 2 });
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

test("content after a shared section keeps the live band's style and its editor index", () => {
  const blocks: Block[] = [
    { id: "band", type: "section", background: "inverse", width: "wide", spacing: "compact", align: "center" },
    { id: "before", type: "text", text: "Vorher" },
    { id: "reference", type: "shared", sectionId: "contact" },
    { id: "after", type: "text", text: "Nachher" },
  ];
  const html = renderToStaticMarkup(<BlockFlow blocks={blocks}>{(block, index) => <span data-block={block.id} data-index={index} />}</BlockFlow>);
  expect(html).toContain('<div class="t-band t-band-inverse t-band-width-wide t-band-spacing-compact t-band-align-center"><span data-block="after" data-index="3"></span></div>');
  expect(html).not.toContain('data-block="reference" data-index="2"></span><span data-block="after"');
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
