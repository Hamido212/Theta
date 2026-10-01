import { type DragEvent, type FormEvent, Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BLOG,
  type Block,
  type BlockType,
  HOME,
  PROP_FIELDS,
  type NavItem,
  type Page,
  type PropValues,
  type SharedBlock,
  type Revision,
  ValidationError,
  blockLabels,
  editPath,
  formatDate,
  newBlock,
  pagePath,
} from "../blocks";
import type { EditorData } from "../render";
import { BlockFlow, BlockView } from "../theme/blocks";
import { SiteFrame } from "../theme/layout";
import { LanguageContext } from "../theme/language";
import { type SavedSectionTemplate, type SectionTemplate, findTemplates, insertTemplate, sectionTemplates } from "../templates";
import { blockRange, copyBlocks, duplicateBlocks, isSectionBoundary, moveBlocks, removeBlocks, stepBlocks } from "./sections";
import { applyProps, ruleBlocks, visibleBlocks, type SharedSectionData, startIndex, validateSection } from "../shared-sections";
import { PostsContext } from "../theme/posts";
import { fromClipboard, replaceImage, toClipboard } from "./clipboard";
import { type BlockAction, BlockMenu, StructureTree, rowLabel, shortcuts } from "./structure";
import { DraftWriter, draftKey, SaveError, type Draft, type SaveAction } from "./draft-writer";
import { FormatBar } from "./format";
import { HistoryPanel } from "./history";
import { BlockOptions, BlockSettings, LinkTarget } from "./settings";
import { MediaPicker } from "./media-picker";

type SaveState = "saved" | "dirty" | "saving" | "error";
type PageMeta = Pick<Page, "title" | "description" | "inNav">;

const saveLabels: Record<SaveState, string> = {
  saved: "Entwurf gespeichert",
  dirty: "Nicht gespeichert",
  saving: "Speichert …",
  error: "Speichern fehlgeschlagen",
};

// Typing in a text field keeps the browser's own shortcuts; block shortcuts apply elsewhere.
const isTyping = (target: EventTarget | null) =>
  target instanceof Element && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;

const MAX_UNDO = 50;

function Editor({ page, site, nav, legal, pages, templates = [], sharedSections = [], layoutRules = [], posts = [] }: EditorData) {
  const [blocks, setBlocks] = useState(page.blocks);
  const post = page.kind === "post";
  const sharedPage = page.kind === "section";
  const [shared, setShared] = useState(sharedSections);
  const [sharedName, setSharedName] = useState("");
  const [sharedBusy, setSharedBusy] = useState(false);
  const [meta, setMeta] = useState<PageMeta>({
    title: page.title,
    description: page.description,
    inNav: page.inNav,
  });
  // Only the published snapshot is visible to visitors.
  const [savedPage, setSavedPage] = useState(page);
  const publishedAt = savedPage.publishedAt;
  const [savedTemplates, setSavedTemplates] = useState(templates);
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [side, setSide] = useState<"pages" | "inspector" | null>(null);
  const [conflict, setConflict] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restorePending = useRef(false);
  const writer = useRef<DraftWriter | null>(null);
  if (!writer.current) writer.current = new DraftWriter(page);
  const latest = useRef({ ...meta, blocks });
  latest.current = { ...meta, blocks };
  const [panel, setPanel] = useState<"settings" | "history" | null>(null);
  const [notice, setNotice] = useState("");
  const [blockedPreview, setBlockedPreview] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [slowSave, setSlowSave] = useState(false);
  const state: SaveState = pendingSaves > 0 ? "saving" : saveFailed ? "error" :
    draftKey({ ...meta, blocks }) === writer.current.savedKey ? "saved" : "dirty";
  const [error, setError] = useState("");
  // The block whose settings are open; only one at a time keeps the page readable.
  const [selected, setSelected] = useState<string | null>(null);
  // Where the "add block" menu is open: the index a new block will get.
  const [adding, setAdding] = useState<number | null>(null);
  // The block a failed save complained about.
  const [errorBlock, setErrorBlock] = useState<string | null>(null);
  // Drag and drop: the block being dragged and where it would land.
  const dragging = useRef<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const discarding = useRef(false);
  // Right-click menu for a block, at a position in the window.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // Earlier block lists for Ctrl+Z after moving, hiding, pasting or deleting.
  const undoStack = useRef<Block[][]>([]);
  // What the next copy event puts on the clipboard (see copyToClipboard).
  const pendingCopy = useRef<string | null>(null);
  const touch = () => {
    setNotice("");
    setBlockedPreview(false);
    if (!writer.current!.conflict) {
      setSaveFailed(false);
      setError("");
    }
  };

  const change = (next: (blocks: Block[]) => Block[]) => {
    setBlocks(next);
    touch();
  };

  const changeMeta = (patch: Partial<PageMeta>) => {
    setMeta((current) => ({ ...current, ...patch }));
    touch();
  };

  // Changes to the structure can be undone with Ctrl+Z; typing has the browser's own undo.
  const structural = (next: (blocks: Block[]) => Block[]) => {
    undoStack.current = [...undoStack.current.slice(-(MAX_UNDO - 1)), latest.current.blocks];
    change(next);
  };
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) { setNotice("Es gibt nichts rückgängig zu machen."); return; }
    change(() => previous);
    if (!previous.some((block) => block.id === selected)) setSelected(null);
    setNotice("Rückgängig gemacht.");
  };

  const update = (id: string, patch: Partial<Block>) =>
    change((list) => list.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));

  const move = (index: number, delta: -1 | 1) => {
    if (sharedPage && index + delta < 1) return;
    structural((list) => stepBlocks(list, index, delta));
  };

  // Moves the block at index `from` so that it lands before the block now at index `to`.
  // Dropping on the upper half of a block puts the dragged one before it, otherwise after it.
  const dropIndex = (event: DragEvent<HTMLElement>, index: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? index : index + 1;
  };

  const moveTo = (from: number, to: number) => structural((list) => moveBlocks(list, from, sharedPage ? Math.max(1, to) : to));
  const remove = (id: string) => {
    structural((list) => removeBlocks(list, list.findIndex((b) => b.id === id)));
    setSelected(null);
    setNotice(`Gelöscht. ${shortcuts.copy.replace("C", "Z")} macht es rückgängig.`);
  };
  const duplicate = (index: number) => structural((list) => duplicateBlocks(list, index));
  const toggleHidden = (id: string) => structural((list) => list.map((block) => (block.id === id ? ({ ...block, hidden: !block.hidden || undefined } as Block) : block)));

  const togglePanel = (name: "settings" | "history") => setPanel((open) => (open === name ? null : name));
  const add = (type: BlockType, at: number) => {
    const block = newBlock(type);
    change((list) => [...list.slice(0, at), block, ...list.slice(at)]);
    setAdding(null);
    setSelected(block.id);
  };

  const addTemplate = (template: SectionTemplate, at: number) => {
    const inserted = template.blocks();
    change((list) => insertTemplate(list, at, inserted));
    setAdding(null);
    setSelected(inserted.find((block) => block.type === "heading")?.id ?? inserted[0]!.id);
  };

  const refreshShared = useCallback(async () => {
    try {
      const response = await fetch("/api/shared-sections");
      if (!response.ok) throw new Error("Gemeinsame Abschnitte konnten nicht aktualisiert werden.");
      setShared(await response.json() as SharedSectionData[]);
    } catch (err) { setNotice(err instanceof Error ? err.message : String(err)); }
  }, []);

  const save = useCallback(async (action: SaveAction = "save", autosave = false, restoration?: Draft) => {
    if (restorePending.current) return false;
    if (restoration) { restorePending.current = true; setRestoring(true); }
    setBlockedPreview(false);
    setPendingSaves((count) => count + 1);
    setSaveFailed(false);
    if (action !== "save") setPublishing(true);
    try {
      const result = restoration
        ? await writer.current!.restore(() => latest.current, restoration)
        : await writer.current!.save(() => latest.current, action, autosave);
      if (restoration) {
        const restored = { title: result.title, description: result.description, inNav: result.inNav, blocks: result.blocks };
        latest.current = restored;
        setMeta({ title: restored.title, description: restored.description, inNav: restored.inNav });
        setBlocks(restored.blocks);
        setSelected(null);
        setAdding(null);
      }
      setSavedPage(result);
      if (result.kind === "section" || result.blocks.some((block) => block.type === "shared")) void refreshShared();
      setErrorBlock(null);
      setError("");
      setNotice(action === "publish" ? "Die gespeicherte Fassung ist jetzt veröffentlicht." : action === "unpublish" ? "Die Seite ist jetzt ein Entwurf." : "");
      return true;
    } catch (err) {
      setSavedPage(writer.current!.page);
      if (err instanceof SaveError) {
        setConflict(err.conflict);
        const bad = err.block === undefined ? null : latest.current.blocks[err.block]?.id ?? null;
        setErrorBlock(bad);
        if (bad) {
          setSelected(bad);
          document.getElementById(`block-${bad}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      setError(err instanceof Error ? err.message : String(err));
      setSaveFailed(true);
      return false;
    } finally {
      setPendingSaves((count) => count - 1);
      if (action !== "save") setPublishing(false);
      if (restoration) { restorePending.current = false; setRestoring(false); }
    }
  }, [refreshShared]);

  useEffect(() => {
    setSlowSave(false);
    if (pendingSaves === 0) return;
    const timer = window.setTimeout(() => setSlowSave(true), 4000);
    return () => window.clearTimeout(timer);
  }, [pendingSaves > 0]);

  const loadRevision = async (revision: Revision) => {
    const restored = { title: revision.title, description: revision.description, inNav: revision.inNav, blocks: revision.blocks };
    if (await save("save", false, restored)) {
      setPanel(null);
      const when = new Date(revision.createdAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
      setNotice(`Version vom ${when} als Entwurf wiederhergestellt. Der vorherige Stand bleibt im Verlauf. Veröffentlichen, um sie live zu übernehmen.`);
    }
  };

  useEffect(() => {
    if (state !== "dirty" || conflict || publishing || restoring) return;
    const timer = window.setTimeout(() => { void save("save", true); }, 1000);
    return () => window.clearTimeout(timer);
  }, [blocks, meta, state, conflict, publishing, restoring, save]);

  const preview = async () => {
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    if (await save()) {
      if (win) win.location.href = `/admin/preview/${encodeURIComponent(page.slug)}`;
      else {
        setBlockedPreview(true);
        setNotice("Das Vorschaufenster wurde blockiert. Öffne den Vorschau-Link unter dieser Meldung.");
      }
    } else win?.close();
  };

  // Saves first, so nothing typed is lost, then moves the page and reopens it under its new address.
  const changeAddress = async (slug: string): Promise<string> => {
    if (!(await save())) return "Bitte zuerst die Fehler beim Speichern beheben.";
    try {
      const response = await fetch(`/api/pages/${encodeURIComponent(page.slug)}/address`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, version: writer.current!.page.version }),
      });
      const result = (await response.json().catch(() => ({}))) as Page & { error?: string };
      if (!response.ok) return result.error ?? "Die Adresse konnte nicht geändert werden.";
      if (result.slug !== page.slug) location.replace(editPath(result.slug));
      return "";
    } catch {
      return "Keine Verbindung zum Server. Bitte versuche es noch einmal.";
    }
  };

  const chosenIndex = blocks.findIndex((block) => block.id === selected);
  const chosen = blocks[chosenIndex];
  const chosenShared = chosen?.type === "shared" ? shared.find((item) => item.page.slug === chosen.sectionId) : undefined;
  const sharedUsage = shared.find((item) => item.page.slug === page.slug)?.usage ?? [];
  const unpublishedShared = blocks.some((block) => block.type === "shared" && !shared.find((item) => item.page.slug === block.sectionId)?.liveBlocks);
  useEffect(() => {
    const refresh = () => { void refreshShared(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refreshShared]);
  const addShared = (item: SharedSectionData, at: number) => {
    const block: Block = { id: crypto.randomUUID(), type: "shared", sectionId: item.page.slug };
    change((list) => insertTemplate(list, at, [block]));
    setAdding(null); setSelected(block.id); setPanel(null);
  };
  const makeShared = async () => {
    if (chosen?.type !== "section" || sharedPage || sharedBusy) return;
    const [start, end] = blockRange(blocks, chosenIndex);
    const source = blocks.slice(start, end);
    const sourceKey = JSON.stringify(source);
    setSharedBusy(true);
    try {
      const response = await fetch("/api/shared-sections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: sharedName, blocks: copyBlocks(source) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Der Abschnitt konnte nicht angelegt werden.");
      const item = data as SharedSectionData;
      setShared((list) => [...list, item]);
      // Do not replace edits made while the new central draft was being created.
      const currentIndex = latest.current.blocks.findIndex((block) => block.id === chosen.id);
      const [currentStart, currentEnd] = blockRange(latest.current.blocks, currentIndex);
      if (currentIndex < 0 || JSON.stringify(latest.current.blocks.slice(currentStart, currentEnd)) !== sourceKey) {
        setNotice("Gemeinsamer Entwurf angelegt. Deine zwischenzeitlichen Änderungen bleiben unabhängig auf dieser Seite. Öffne ihn unter Gemeinsame Abschnitte.");
        return;
      }
      const reference: Block = { id: crypto.randomUUID(), type: "shared", sectionId: item.page.slug };
      change((list) => [...list.slice(0, currentStart), reference, ...list.slice(currentEnd)]);
      setSelected(reference.id); setSharedName("");
      setNotice("Gemeinsamer Abschnitt als Entwurf angelegt. Öffne die zentrale Bearbeitung und veröffentliche ihn, bevor du diese Seite veröffentlichst.");
    } catch (err) { setNotice(err instanceof Error ? err.message : String(err)); }
    finally { setSharedBusy(false); }
  };
  // A page's own text or picture for one field its shared section offers.
  const override = (shared: Block, target: Block, patch: Partial<PropValues> | null) => {
    if (shared.type !== "shared") return;
    const fields = PROP_FIELDS[target.type] ?? [];
    const { [target.id]: current = {}, ...others } = shared.overrides ?? {};
    const values: PropValues = patch === null ? {} : { ...current, ...Object.fromEntries(Object.entries(patch).filter(([field]) => fields.includes(field as never))) };
    const overrides = Object.keys(values).length > 0 ? { ...others, [target.id]: values } : others;
    update(shared.id, { overrides: Object.keys(overrides).length > 0 ? overrides : undefined } as Partial<Block>);
  };
  const detachShared = () => {
    if (chosen?.type !== "shared" || !chosenShared) return;
    const copies = copyBlocks(applyProps(chosenShared.liveBlocks ?? chosenShared.page.blocks, chosen.overrides)).map((block) => {
      if (block.type !== "section") return block;
      const { props: _props, ...section } = block;
      return section;
    });
    change((list) => list.flatMap((block) => block.id === chosen.id ? copies : [block]));
    setSelected(copies[0]!.id);
    setNotice(chosenShared.liveBlocks ? "Die veröffentlichte zentrale Fassung ist jetzt eine unabhängige Kopie auf dieser Seite." : "Der zentrale Entwurf ist jetzt eine unabhängige Kopie auf dieser Seite.");
  };
  // Copy and paste, also between two Theta sites. The copy event carries the data, which
  // works without clipboard permissions and on sites without HTTPS.
  const copyToClipboard = (id: string) => {
    const index = latest.current.blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const [start, end] = blockRange(latest.current.blocks, index);
    const text = toClipboard(latest.current.blocks.slice(start, end), shared, location.origin);
    pendingCopy.current = text;
    const done = document.execCommand("copy");
    pendingCopy.current = null;
    if (!done) void navigator.clipboard?.writeText(text);
    setNotice(`${end - start > 1 ? "Abschnitt" : blockLabels[latest.current.blocks[index]!.type]} kopiert. Du kannst ihn hier oder auf einer anderen Theta-Website mit ${shortcuts.paste} einfügen.`);
  };

  const pasteBlocks = async (text: string) => {
    let pasted;
    try {
      pasted = fromClipboard(text, location.origin);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      return true;
    }
    if (!pasted) return false;
    if (sharedPage && pasted.blocks.some((block) => block.type === "section" || block.type === "shared" || block.type === "hero" || (block.type === "heading" && block.level === 1))) {
      setNotice("In einen gemeinsamen Abschnitt passen nur einzelne Blöcke, keine ganzen Abschnitte oder Titel.");
      return true;
    }
    const list = latest.current.blocks;
    const at = selected ? blockRange(list, list.findIndex((block) => block.id === selected))[1] : list.length;
    structural((current) => insertTemplate(current, Math.max(sharedPage ? 1 : 0, Math.min(at, current.length)), pasted.blocks));
    setSelected(pasted.blocks[0]!.id);
    setNotice(pasted.images.length ? `Eingefügt. ${pasted.images.length === 1 ? "Das Bild wird" : `${pasted.images.length} Bilder werden`} in deine Mediathek übernommen …` : "Eingefügt.");
    requestAnimationFrame(() => document.getElementById(`block-${pasted.blocks[0]!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    let failed = 0;
    for (const url of pasted.images) {
      try {
        const response = await fetch("/api/media/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
        const item = await response.json() as { url?: string; error?: string };
        if (!response.ok || !item.url) throw new Error(item.error);
        change((current) => replaceImage(current, url, item.url!));
      } catch { failed++; }
    }
    if (pasted.images.length) setNotice(failed ? `Eingefügt. ${failed} von ${pasted.images.length} Bildern konnten nicht übernommen werden und werden noch von der anderen Website geladen. Ersetze sie am besten durch eigene.` : "Eingefügt, alle Bilder liegen jetzt in deiner Mediathek.");
    return true;
  };

  const pasteFromMenu = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!(await pasteBlocks(text))) setNotice("In der Zwischenablage liegen keine kopierten Theta-Blöcke.");
    } catch {
      setNotice(`Der Browser erlaubt das Einfügen nur per Tastatur. Drücke ${shortcuts.paste}.`);
    }
  };

  const act = (action: BlockAction, id: string) => {
    const list = latest.current.blocks;
    const index = list.findIndex((block) => block.id === id);
    const block = list[index];
    if (!block) return;
    // The section that frames a shared section's content stays in place.
    if (sharedPage && index === 0 && action !== "paste") return;
    if (action === "copy") copyToClipboard(id);
    else if (action === "paste") void pasteFromMenu();
    else if (action === "duplicate") duplicate(index);
    else if (action === "hide") {
      toggleHidden(id);
      setNotice(block.hidden ? "Wieder eingeblendet." : `Ausgeblendet. Besucher sehen ${block.type === "section" ? "diesen Abschnitt" : "diesen Block"} nach dem Veröffentlichen nicht mehr, im Editor bleibt er.`);
    }
    else if (action === "up" || action === "down") {
      if (canMove(list, index)[action]) move(index, action === "up" ? -1 : 1);
    }
    else if (action === "remove") remove(id);
    if (action === "up" || action === "down") requestAnimationFrame(() => document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const canMove = (list: Block[], index: number) => {
    const block = list[index]!;
    return isSectionBoundary(block)
      ? { up: list.slice(0, index).some(isSectionBoundary), down: list.slice(index + 1).some(isSectionBoundary) }
      : { up: index > (sharedPage ? 1 : 0), down: index < list.length - 1 };
  };

  // Blocks inside a hidden section are hidden with it.
  const hiddenIds = new Set<string>();
  blocks.forEach((block, index) => {
    if (block.type === "section" && block.hidden) for (let i = index; i < blockRange(blocks, index)[1]; i++) hiddenIds.add(blocks[i]!.id);
    else if (block.hidden) hiddenIds.add(block.id);
  });

  const closeMenu = useCallback(() => setMenu(null), []);
  const selectBlock = (id: string) => {
    setSelected(id); setPanel(null);
    document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // Shared sections that rules add to every page of this kind, shown read-only around the content.
  const liveShared = Object.fromEntries(shared.flatMap((item) => (item.liveBlocks ? [[item.page.slug, item.liveBlocks]] : [])));
  const automatic = ruleBlocks({ kind: page.kind, blocks }, layoutRules, liveShared);
  const automaticAt = startIndex(blocks);
  const automaticPreview = (list: Block[]) => list.map((block) => block.type === "shared" && (
    <SharedPreview key={block.id} item={shared.find((item) => item.page.slug === block.sectionId)} automatic />
  ));

  let canShare = false;
  if (chosen?.type === "section" && !sharedPage) {
    try { const [start, end] = blockRange(blocks, chosenIndex); validateSection(blocks.slice(start, end)); canShare = true; } catch { /* explained beside the disabled button */ }
  }
  const saveTemplate = async () => {
    if (chosen?.type !== "section" || templateBusy) return;
    setTemplateBusy(true);
    try {
      const [start, end] = blockRange(blocks, chosenIndex);
      const res = await fetch("/api/section-templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: templateName, blocks: blocks.slice(start, end) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSavedTemplates((list) => [data as SavedSectionTemplate, ...list]);
      setTemplateName("");
      setNotice("Abschnitt als eigene Vorlage gespeichert.");
    } catch (err) { setNotice(err instanceof Error ? err.message : String(err)); }
    finally { setTemplateBusy(false); }
  };
  const customTemplates: SectionTemplate[] = savedTemplates.map((template) => ({ id: template.id, label: template.title, hint: "Eigene Abschnittsvorlage · unabhängige Kopie", category: "custom", blocks: () => copyBlocks(template.blocks) }));
  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/section-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Vorlage konnte nicht gelöscht werden.");
      setSavedTemplates((list) => list.filter((template) => template.id !== id));
    } catch (err) { setNotice(err instanceof Error ? err.message : String(err)); }
  };

  // Ctrl/Cmd + S saves, and leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (command && key === "s") {
        event.preventDefault();
        void save();
        return;
      }
      if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (isTyping(event.target)) {
        // Escape leaves the text and goes back to the block, so its shortcuts work again.
        if (event.key === "Escape" && selected) {
          (event.target as HTMLElement).blur();
          document.querySelector<HTMLElement>(`.theta-tree [data-block="${CSS.escape(selected)}"]`)?.focus();
        }
        return;
      }
      if (command && !event.shiftKey && key === "z") { event.preventDefault(); undo(); return; }
      if (!selected) return;
      let action: BlockAction | null = null;
      if (command && key === "d") action = "duplicate";
      else if (event.altKey && event.code === "KeyH") action = "hide";
      else if (event.altKey && event.key === "ArrowUp") action = "up";
      else if (event.altKey && event.key === "ArrowDown") action = "down";
      else if (!command && (event.key === "Delete" || event.key === "Backspace")) action = "remove";
      else if (event.key === "Escape") { setSelected(null); return; }
      if (!action) return;
      event.preventDefault();
      act(action, selected);
    };
    const onCopy = (event: ClipboardEvent) => {
      if (pendingCopy.current === null && (isTyping(event.target) || !selected || document.getSelection()?.toString())) return;
      const text = pendingCopy.current ?? (() => {
        const index = latest.current.blocks.findIndex((block) => block.id === selected);
        if (index < 0) return null;
        const [start, end] = blockRange(latest.current.blocks, index);
        setNotice(`Kopiert. Du kannst es hier oder auf einer anderen Theta-Website mit ${shortcuts.paste} einfügen.`);
        return toClipboard(latest.current.blocks.slice(start, end), shared, location.origin);
      })();
      if (text === null || !event.clipboardData) return;
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      // Blocks are pasted as blocks even when a text field has the focus.
      if (!text.includes("theta-blocks")) return;
      event.preventDefault();
      void pasteBlocks(text);
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if ((state !== "saved" || restorePending.current) && !discarding.current) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  });

  return (
    <div className="theta-workspace">
      <header className="theta-bar">
        <a className="theta-logo" href={sharedPage ? "/admin/shared-sections" : post ? "/admin/blog" : "/admin"}>
          θ Übersicht
        </a>
        <button className="theta-button theta-mobile-toggle" onClick={() => setSide(side === "pages" ? null : "pages")} aria-expanded={side === "pages"}>Seiten</button>
        <button className="theta-button theta-mobile-toggle" onClick={() => setSide(side === "inspector" ? null : "inspector")} aria-expanded={side === "inspector"}>Einstellungen</button>
        <span className={`theta-status theta-status-${state}`} role="status" aria-live="polite" title={error || undefined}>
          {state === "saving" && slowSave ? "Speichern dauert länger …" : saveLabels[state]}
        </span>
        <button className="theta-button" onClick={() => { togglePanel("history"); setSide("inspector"); }} aria-expanded={panel === "history"}>
          Verlauf
        </button>
        <button className="theta-button" onClick={() => { togglePanel("settings"); setSide("inspector"); }} aria-expanded={panel === "settings"}>
          {post ? "Beitragseinstellungen" : "Seiteneinstellungen"}
        </button>
        {publishedAt && !sharedPage && (
          <a className="theta-button" href={pagePath(page)} target="_blank" rel="noopener">
            Ansehen
          </a>
        )}
        <button className="theta-button" onClick={() => void save()} disabled={state === "saving" || state === "saved" || conflict}>
          Speichern
        </button>
        <button className="theta-button" onClick={() => void preview()} disabled={conflict || publishing || restoring}>Vorschau</button>
        <button className="theta-button theta-primary" onClick={() => void save("publish")} disabled={publishing || restoring || conflict || unpublishedShared || (state === "saved" && !savedPage.hasChanges)}>Veröffentlichen</button>
        <form method="post" action="/logout">
          <button className="theta-button" type="submit">
            Abmelden
          </button>
        </form>
      </header>

      <div className="theta-workbench" inert={restoring}>
        <aside className={`theta-sidebar theta-navigation ${side === "pages" ? "theta-side-open" : ""}`} aria-label="Seiten und Abschnitte">
          <h2>Deine Website</h2>
          <nav>{pages.filter((p) => p.slug !== BLOG).map((p) => <a key={p.slug} href={editPath(p.slug)} aria-current={p.slug === page.slug ? "page" : undefined}>{p.slug === page.slug ? meta.title : p.title}</a>)}</nav>
          <div className="theta-nav-links"><a href="/admin">Seiten verwalten</a><a href="/admin/shared-sections">Gemeinsame Abschnitte</a><a href="/admin/media">Mediathek</a><a href="/admin/design">Design</a><a href="/admin/trash">Papierkorb</a></div>
          <h2>Auf dieser Seite</h2>
          <StructureTree blocks={blocks} shared={shared} selected={selected} hiddenIds={hiddenIds} onSelect={selectBlock} onMenu={(id, x, y) => setMenu({ id, x, y })} />
          {(automatic.start.length > 0 || automatic.end.length > 0) && <p className="theta-tree-note">Automatisch dazu: {[...automatic.start, ...automatic.end].map((block) => rowLabel(block, blocks, shared).replace("Gemeinsam: ", "")).join(", ")}</p>}
          <details className="theta-shortcuts"><summary>Tastenkürzel</summary><dl>
            <dt>{shortcuts.copy} / {shortcuts.paste}</dt><dd>Block oder Abschnitt kopieren und einfügen, auch auf einer anderen Theta-Website</dd>
            <dt>{shortcuts.duplicate}</dt><dd>Verdoppeln</dd>
            <dt>{shortcuts.up} / {shortcuts.down}</dt><dd>Verschieben</dd>
            <dt>{shortcuts.hide}</dt><dd>Aus- oder einblenden</dd>
            <dt>{shortcuts.remove}</dt><dd>Löschen</dd>
            <dt>{shortcuts.copy.replace("C", "Z")}</dt><dd>Rückgängig</dd>
            <dt>Esc</dt><dd>Text verlassen, damit die Kürzel wirken</dd>
          </dl><p>Rechtsklick auf einen Eintrag zeigt alle Aktionen.</p></details>
        </aside>
        <div className="theta-canvas">
          {notice && <p className="theta-notice" role="status">{notice}{blockedPreview && <> <a href={`/admin/preview/${encodeURIComponent(page.slug)}`} target="_blank" rel="noopener">Gespeicherten Entwurf ansehen</a></>}</p>}
          {state === "saving" && slowSave && <p className="theta-notice" role="status">Wir warten auf die Bestätigung des Servers. Du kannst weiter schreiben. Dein Text bleibt hier erhalten.</p>}
          {sharedPage && <p className="theta-notice">Du bearbeitest den gemeinsamen Abschnitt „{meta.title}“. Nach der Veröffentlichung verwenden alle eingebundenen Seiten diese Fassung. Deine gespeicherten Änderungen bleiben bis dahin privat.</p>}
          {error && <div className="theta-error-banner" role="alert"><p>{error}</p>{conflict ? <button className="theta-button" onClick={() => { discarding.current = true; window.location.reload(); }}>Eigene Änderungen verwerfen und Serverstand laden</button> : <button className="theta-button" onClick={() => void save()}>Erneut speichern</button>}</div>}
          <div className="theta-format-dock"><FormatBar /><span>Text direkt auf der Seite bearbeiten</span></div>
      <LanguageContext.Provider value={site.language ?? "de"}>
      <PostsContext.Provider value={{ posts, current: post ? page.slug : undefined }}>
      <SiteFrame site={site} nav={nav} legal={legal} current={post ? BLOG : page.slug} linkTo={editPath}>
        {post && (
          <p className="t-post-meta">
            {publishedAt ? formatDate(publishedAt ?? new Date().toISOString(), site.language) : "Entwurf, noch nicht veröffentlicht"}
          </p>
        )}
        {automaticAt === 0 && automaticPreview(automatic.start)}
        <BlockFlow blocks={blocks}>
          {(block, index) => {
            const edit = (patch: Partial<Block>) => update(block.id, patch);
            const classes = [
              "theta-block",
              selected === block.id && "theta-selected",
              errorBlock === block.id && "theta-block-error",
              dropAt === index && "theta-drop-before",
              dropAt === index + 1 && index === blocks.length - 1 && "theta-drop-after",
              hiddenIds.has(block.id) && "theta-block-hidden",
              block.hidden && "theta-hidden-self",
              sharedPage && blocks[0]?.type === "section" && blocks[0].props?.includes(block.id) && "theta-prop-source",
            ];
            return (<Fragment key={block.id}>
              <section
                key={block.id}
                id={`block-${block.id}`}
                className={classes.filter(Boolean).join(" ")}
                aria-label={blockLabels[block.type]}
                onFocus={() => { setSelected(block.id); setPanel(null); }}
                onClick={() => { setSelected(block.id); setPanel(null); }}
                onDragOver={(event) => {
                  if (dragging.current === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropAt(dropIndex(event, index));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  // Read the position from the event itself; the state may not have caught up yet.
                  if (dragging.current !== null) moveTo(dragging.current, dropIndex(event, index));
                  dragging.current = null;
                  setDropAt(null);
                }}
              >
                <div className="theta-controls" onContextMenu={(event) => { event.preventDefault(); setSelected(block.id); setMenu({ id: block.id, x: event.clientX, y: event.clientY }); }}>
                  {!(sharedPage && block.type === "section") && <><span
                    className="theta-handle"
                    draggable
                    title="Ziehen zum Verschieben"
                    onDragStart={(event) => {
                      dragging.current = index;
                      event.dataTransfer.effectAllowed = "move";
                      // Some browsers only start a drag that carries data.
                      event.dataTransfer.setData("text/plain", block.id);
                      event.dataTransfer.setDragImage(event.currentTarget.closest("section")!, 20, 20);
                    }}
                    onDragEnd={() => {
                      dragging.current = null;
                      setDropAt(null);
                    }}
                  >
                    ⠿
                  </span>
                  <span className="theta-block-label">{blockLabels[block.type]}</span>
                  <button onClick={() => move(index, -1)} disabled={isSectionBoundary(block) ? !blocks.slice(0, index).some(isSectionBoundary) : index === 0 || (sharedPage && index === 1)} aria-label="Nach oben">
                    ↑
                  </button>
                  <button onClick={() => move(index, 1)} disabled={isSectionBoundary(block) ? !blocks.slice(index + 1).some(isSectionBoundary) : index === blocks.length - 1} aria-label="Nach unten">
                    ↓
                  </button>
                  <button onClick={() => duplicate(index)} aria-label={block.type === "section" ? "Abschnitt verdoppeln" : "Block verdoppeln"} title="Verdoppeln">
                    ⧉
                  </button>
                  <button onClick={() => remove(block.id)} aria-label={block.type === "section" ? "Abschnitt mit Inhalt löschen" : "Block löschen"}>
                    ✕
                  </button></>}
                  {sharedPage && block.type === "section" && <span className="theta-block-label">Abschnitt</span>}
                </div>
                {block.type === "shared" ? <SharedPreview item={shared.find((item) => item.page.slug === block.sectionId)} overrides={block.overrides} onOverride={(target, patch) => override(block, target, patch)} /> : <BlockView block={block} edit={edit} />}
                <button
                  className="theta-insert"
                  aria-label="Hier einen Block einfügen"
                  title="Hier einen Block einfügen"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAdding(adding === index + 1 ? null : index + 1);
                  }}
                >
                  +
                </button>
                {adding === index + 1 && <AddMenu custom={customTemplates} sectionOnly={sharedPage} shared={shared} onShared={(item) => addShared(item, index + 1)}
                    onAdd={(type) => add(type, index + 1)}
                    onTemplate={(template) => addTemplate(template, index + 1)}
                    onClose={() => setAdding(null)}
                  />}
              </section>
              {automaticAt > 0 && index === automaticAt - 1 && automaticPreview(automatic.start)}
            </Fragment>);
          }}
        </BlockFlow>
        {automaticPreview(automatic.end)}

        <div className="theta-add">
          <AddMenu custom={customTemplates} sectionOnly={sharedPage} shared={shared} onShared={(item) => addShared(item, blocks.length)} onAdd={(type) => add(type, blocks.length)} onTemplate={(template) => addTemplate(template, blocks.length)} />
        </div>
      </SiteFrame>
      </PostsContext.Provider>
      </LanguageContext.Provider>
        </div>
        <aside className={`theta-sidebar theta-inspector ${side === "inspector" ? "theta-side-open" : ""}`} aria-label="Einstellungen">
          <div className="theta-publication"><h2>Veröffentlichung</h2><strong>{publishedAt ? "Live-Version vorhanden" : "Noch nicht veröffentlicht"}</strong><p>{savedPage.hasChanges || state !== "saved" ? "Änderungen bleiben im Entwurf, bis du sie veröffentlichst." : "Besucher sehen diese Fassung."}</p>
            {unpublishedShared && <p>Veröffentliche zuerst die eingebundenen gemeinsamen Abschnitte. <button className="theta-button" onClick={() => void refreshShared()}>Zentrale Fassungen aktualisieren</button></p>}
            {sharedPage && <><p>Verwendet auf {sharedUsage.length} {sharedUsage.length === 1 ? "Seite" : "Seiten"}:</p><ul>{sharedUsage.map((item) => <li key={item.slug}><a href={item.href}>{item.title}</a></li>)}</ul></>}
            {publishedAt && page.slug !== HOME && <button className="theta-button" disabled={publishing || conflict || (sharedPage && sharedUsage.length > 0)} onClick={() => void save("unpublish")}>Veröffentlichung zurücknehmen</button>}
          </div>
          {panel === "history" ? <HistoryPanel slug={page.slug} onLoad={loadRevision} /> : panel === "settings" ? <PageSettings page={savedPage} meta={meta} onChange={changeMeta} onAddress={changeAddress} /> : chosen ? <>
            <h2>{blockLabels[chosen.type]}</h2>
            <BlockOptions block={chosen} allowTitle={!sharedPage} onChange={(patch) => update(chosen.id, patch)} />
            <BlockSettings block={chosen} onChange={(patch) => update(chosen.id, patch)} pages={pages} />
            {sharedPage && chosenIndex > 0 && PROP_FIELDS[chosen.type] && blocks[0]?.type === "section" && <div className="theta-template-save"><h3>Pro Seite änderbar</h3>
              <label className="theta-check"><input type="checkbox" checked={blocks[0].props?.includes(chosen.id) ?? false} onChange={(event) => {
                const section = blocks[0]!;
                if (section.type !== "section") return;
                const props = (section.props ?? []).filter((id) => id !== chosen.id);
                update(section.id, { props: event.target.checked ? [...props, chosen.id] : props.length > 0 ? props : undefined } as Partial<Block>);
              }} />Auf jeder Seite einzeln änderbar</label>
              <p>Seiten, die diesen Abschnitt einbinden, können hier ihren eigenen {chosen.type === "image" ? "Bild und Bildtext" : chosen.type === "button" ? "Button-Text und ein eigenes Ziel" : "Text"} zeigen. Gestaltung und Reihenfolge bleiben zentral.</p>
            </div>}
            {chosen.type === "section" && <div className="theta-template-save"><h3>Als Vorlage behalten</h3><label>Name<input value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={200} placeholder="Zum Beispiel: Unser Team" /></label><button className="theta-button" disabled={templateBusy || !templateName.trim()} onClick={() => void saveTemplate()}>Abschnitt speichern</button><p>Eine Vorlage fügt später eine unabhängige Kopie ein.</p></div>}
            {chosen.type === "section" && !sharedPage && <div className="theta-template-save"><h3>Gemeinsam pflegen</h3><label>Name des gemeinsamen Abschnitts<input value={sharedName} onChange={(event) => setSharedName(event.target.value)} maxLength={200} placeholder="Zum Beispiel: Projektanfrage" /></label><button className="theta-button" disabled={sharedBusy || !sharedName.trim() || !canShare} onClick={() => void makeShared()}>Als gemeinsamen Abschnitt anlegen</button><p>Die Einbindung ersetzt diesen Abschnitt im Entwurf. Zentrale Änderungen erscheinen nach der Veröffentlichung auf allen eingebundenen Seiten.</p>{!canShare && <p>Wähle einen Abschnitt mit Inhalt, ohne Titelbild oder Seitentitel.</p>}</div>}
            {chosen.type === "shared" && <div className="theta-settings">
              <p>Hier erscheint die veröffentlichte zentrale Fassung. Du bearbeitest sie einmal für alle eingebundenen Seiten.</p>
              {chosenShared ? <><a className="theta-button" href={editPath(chosenShared.page.slug)} target="_blank" rel="noopener">Zentral bearbeiten</a><button className="theta-button" onClick={() => void refreshShared()}>Zentrale Fassung aktualisieren</button><button className="theta-button" onClick={detachShared}>In unabhängige Kopie umwandeln</button><p>{chosenShared.usage.length} verwendende {chosenShared.usage.length === 1 ? "Seite" : "Seiten"}. {chosenShared.page.hasChanges && "Zentrale Änderungen sind noch im Entwurf."}</p></> : <p>Der Abschnitt ist nicht verfügbar. Entferne die Einbindung oder wähle einen anderen Abschnitt.</p>}
              {chosenShared && <PropFields item={chosenShared} block={chosen} pages={pages} onOverride={(target, patch) => override(chosen, target, patch)} />}
              <label>Gemeinsamen Abschnitt wählen<select value={chosen.sectionId} onChange={(event) => update(chosen.id, { sectionId: event.target.value })}><option value={chosen.sectionId}>{chosenShared?.page.title ?? "Nicht verfügbar"}</option>{shared.filter((item) => item.liveBlocks && item.page.slug !== chosen.sectionId).map((item) => <option key={item.page.slug} value={item.page.slug}>{item.page.title}</option>)}</select></label>
            </div>}
          </> : <><h2>Seite gestalten</h2><p>Wähle einen Block auf der Seite aus, um seine Einstellungen zu sehen.</p></>}
          {savedTemplates.length > 0 && <details className="theta-own-templates"><summary>Eigene Vorlagen ({savedTemplates.length})</summary>{savedTemplates.map((template) => <div key={template.id}><span>{template.title}</span><button className="theta-button" onClick={() => void deleteTemplate(template.id)} aria-label={`Vorlage ${template.title} löschen`}>Löschen</button></div>)}</details>}
        </aside>
      </div>
      {menu && (() => {
        const index = blocks.findIndex((block) => block.id === menu.id);
        if (index < 0) return null;
        return <BlockMenu x={menu.x} y={menu.y} block={blocks[index]!} canMove={canMove(blocks, index)} locked={sharedPage && index === 0} onAction={(action) => act(action, menu.id)} onClose={closeMenu} />;
      })()}
    </div>
  );
}

// The block types in the order people need them most.
const favourites: BlockType[] = ["heading", "text", "image", "hero", "section", "columns", "button", "gallery", "quote", "video", "divider"];
const addOrder = [...favourites, ...(Object.keys(blockLabels) as BlockType[]).filter((type) => !favourites.includes(type) && type !== "shared")];

type AddMenuProps = { custom?: SectionTemplate[]; sectionOnly?: boolean; shared?: SharedSectionData[]; onShared: (item: SharedSectionData) => void; onAdd: (type: BlockType) => void; onTemplate: (template: SectionTemplate) => void; onClose?: () => void };

function AddMenu({ custom = [], sectionOnly = false, shared = [], onShared, onAdd, onTemplate, onClose }: AddMenuProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const templates = findTemplates([...custom, ...sectionTemplates], search, category);
  return (
    <div
      className="theta-add-menu"
      role="region" aria-label="Blöcke und Abschnitte hinzufügen"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.key === "Escape" && onClose?.()}
    >
      <div className="theta-add-group">
        {addOrder.filter((type) => !sectionOnly || (type !== "hero" && type !== "section")).map((type) => (
          <button key={type} className="theta-button" onClick={() => onAdd(type)}>
            + {blockLabels[type]}
          </button>
        ))}
        {onClose && (
          <button className="theta-button" onClick={onClose}>
            Abbrechen
          </button>
        )}
      </div>
      {!sectionOnly && <div className="theta-add-group theta-template-library">
        <span className="theta-add-heading">Fertige Abschnitte</span>
        <div className="theta-template-filters"><input aria-label="Abschnitte suchen" placeholder="Abschnitte suchen …" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Kategorie der Abschnitte" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Alle Vorlagen</option><option value="agency">Agentur</option><option value="general">Allgemein</option><option value="custom">Eigene Vorlagen</option></select></div>
        {templates.map((template) => (
          <button key={template.id} className="theta-button theta-template" title={template.hint} onClick={() => onTemplate(template)}>
            <strong>{template.label}</strong><small>{template.hint}</small>
          </button>
        ))}
        {templates.length === 0 && <p>Keine passende Vorlage gefunden.</p>}
      </div>}
      {!sectionOnly && <div className="theta-add-group theta-template-library"><span className="theta-add-heading">Gemeinsame Abschnitte</span>
        <p>Einbindung der zentral veröffentlichten Fassung.</p>
        {shared.filter((item) => item.liveBlocks).map((item) => <button key={item.page.slug} className="theta-button theta-template" onClick={() => onShared(item)}><strong>{item.page.title}</strong><small>Gemeinsam gepflegt · {item.usage.length} verwendende {item.usage.length === 1 ? "Seite" : "Seiten"}</small></button>)}
        <a href="/admin/shared-sections" target="_blank" rel="noopener">Gemeinsame Abschnitte verwalten</a>
      </div>}
    </div>
  );
}

type SharedPreviewProps = {
  item?: SharedSectionData;
  // This page's own values; the fields the section offers can be edited right here.
  overrides?: SharedBlock["overrides"];
  onOverride?: (target: Block, patch: Partial<PropValues>) => void;
  // Added by a rule, not by this page.
  automatic?: boolean;
};

function SharedPreview({ item, overrides, onOverride, automatic = false }: SharedPreviewProps) {
  if (!item) return <p className="theta-notice">Gemeinsamer Abschnitt nicht verfügbar. Wähle eine andere Einbindung oder entferne diesen Block.</p>;
  const content = item.liveBlocks ?? item.page.blocks;
  const props = propsOf(content);
  return <div className={`theta-shared-preview${automatic ? " theta-shared-automatic" : ""}`}>
    <div className="theta-shared-caption"><strong>{automatic ? "Automatisch" : "Gemeinsam"}: {item.page.title}</strong><span>{automatic ? "Erscheint durch eine Regel unter Gemeinsame Abschnitte" : item.liveBlocks ? props.length > 0 ? "Hervorgehobene Inhalte kannst du für diese Seite ändern" : "Veröffentlichte Fassung" : "Noch nicht veröffentlicht · Entwurfsvorschau"}</span><a href={automatic ? "/admin/shared-sections" : editPath(item.page.slug)} target="_blank" rel="noopener">{automatic ? "Regel ändern" : "Zentral bearbeiten"}</a></div>
    <div className="theta-shared-content"><BlockFlow blocks={visibleBlocks(applyProps(content, overrides))}>{(block) => onOverride && props.includes(block.id) && PROP_FIELDS[block.type]
      ? <div key={block.id} className="theta-prop"><BlockView block={block} edit={(patch) => onOverride(block, patch as Partial<PropValues>)} /></div>
      : <div key={block.id} className="theta-contents" inert><BlockView block={block} /></div>}</BlockFlow></div>
  </div>;
}

// The blocks a shared section lets each page change.
const propsOf = (content: Block[]) => (content[0]?.type === "section" ? content[0].props ?? [] : []).filter((id) => content.some((block) => block.id === id && PROP_FIELDS[block.type]));

// Fields for page-specific pictures and links, which are not edited directly on the page.
function PropFields({ item, block, pages, onOverride }: { item: SharedSectionData; block: SharedBlock; pages: NavItem[]; onOverride: (target: Block, patch: Partial<PropValues> | null) => void }) {
  const content = item.liveBlocks ?? item.page.blocks;
  const props = propsOf(content);
  if (props.length === 0) return <p>Dieser Abschnitt ist überall gleich. Im zentralen Abschnitt kannst du einzelne Texte, Bilder oder Buttons „auf jeder Seite änderbar“ machen.</p>;
  const applied = applyProps(content, block.overrides);
  return <div className="theta-props">
    <h3>Auf dieser Seite anpassen</h3>
    <p>Texte änderst du direkt auf der Seite. Alles andere bleibt so, wie es zentral gestaltet ist.</p>
    {props.map((id) => {
      const target = applied.find((entry) => entry.id === id)!;
      const own = block.overrides?.[id];
      return <fieldset key={id}>
        <legend>{rowLabel(target, applied, [])}</legend>
        {target.type === "image" && <>
          <MediaPicker label="Eigenes Bild wählen" onSelect={([picked]) => onOverride(target, { src: picked!.url })} />
          <label>Bildbeschreibung<input value={target.alt} onChange={(event) => onOverride(target, { alt: event.target.value })} /></label>
        </>}
        {target.type === "button" && <LinkTarget id={`${block.id}-${id}`} label="Ziel" value={target.href} pages={pages} onChange={(href) => onOverride(target, { href })} />}
        {own ? <button className="theta-button" onClick={() => onOverride(target, null)}>Zentralen Inhalt verwenden</button> : <small>Zeigt den zentralen Inhalt.</small>}
      </fieldset>;
    })}
  </div>;
}

type PageSettingsProps = {
  page: Page;
  meta: PageMeta;
  onChange: (patch: Partial<PageMeta>) => void;
  // Gives the page a new address; resolves to an error message, or "" when it worked.
  onAddress: (slug: string) => Promise<string>;
};

function PageSettings({ page, meta, onChange, onAddress }: PageSettingsProps) {
  const length = meta.description.length;
  return (
    <div className="theta-panel">
      <label>
        Titel
        <input value={meta.title} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label>
        {page.kind === "section" ? "Interne Beschreibung" : "Beschreibung für Suchmaschinen"}
        <textarea
          value={meta.description}
          maxLength={300}
          rows={2}
          placeholder={
            page.kind === "post"
              ? "Worum geht es in diesem Beitrag? Erscheint auch als Vorschau im Blog."
              : "Worum geht es auf dieser Seite? Ein bis zwei Sätze."
          }
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <small className={length > 160 ? "theta-hint" : undefined}>
          {length} Zeichen{length > 160 && ", Google zeigt meist nur rund 160 an"}
        </small>
      </label>
      {page.kind === "page" && page.slug !== HOME && <label className="theta-check"><input type="checkbox" checked={meta.inNav} onChange={(e) => onChange({ inNav: e.target.checked })} />Im Menü anzeigen (nach Veröffentlichung)</label>}
      {page.kind !== "section" && (page.slug === HOME ? <p className="theta-panel-note">Adresse: /</p> : <AddressField page={page} onAddress={onAddress} />)}
    </div>
  );
}

function AddressField({ page, onAddress }: { page: Page; onAddress: (slug: string) => Promise<string> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(page.slug);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <p className="theta-panel-note theta-inline">
        Adresse: {pagePath(page)}
        <button type="button" className="theta-button" onClick={() => setEditing(true)}>
          Ändern
        </button>
      </p>
    );
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(await onAddress(value));
    setBusy(false);
  };
  const cancel = () => {
    setEditing(false);
    setValue(page.slug);
    setError("");
  };
  return (
    <form className="theta-address" onSubmit={(event) => void submit(event)}>
      <label>
        Adresse
        <span className="theta-address-input">
          <span aria-hidden="true">{page.kind === "post" ? `/${BLOG}/` : "/"}</span>
          <input value={value} maxLength={60} required autoFocus onChange={(event) => setValue(event.target.value)} />
        </span>
      </label>
      <small>
        {page.publishedAt
          ? "Gilt sofort, auch für die veröffentlichte Fassung. Wer die alte Adresse aufruft, landet automatisch hier."
          : "Die Seite ist noch nicht veröffentlicht, deshalb braucht die alte Adresse keine Weiterleitung."}{" "}
        Aus Leerzeichen und Umlauten macht Theta eine gültige Adresse.
      </small>
      {error && (
        <p className="theta-hint" role="alert">
          {error}
        </p>
      )}
      <div className="theta-inline">
        <button className="theta-button theta-primary" disabled={busy || !value.trim()}>
          Übernehmen
        </button>
        <button type="button" className="theta-button" onClick={cancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

const data = JSON.parse(document.getElementById("theta-page")!.textContent!) as EditorData;
createRoot(document.getElementById("theta-editor")!).render(<Editor {...data} />);
