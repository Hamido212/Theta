import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BLOG,
  type Block,
  type BlockType,
  HOME,
  type Page,
  type Revision,
  blockLabels,
  editPath,
  formatDate,
  newBlock,
  pagePath,
} from "../blocks";
import type { EditorData } from "../render";
import { BlockFlow, BlockView } from "../theme/blocks";
import { SiteFrame } from "../theme/layout";
import { type SavedSectionTemplate, type SectionTemplate, findTemplates, insertTemplate, sectionTemplates } from "../templates";
import { blockRange, copyBlocks, duplicateBlocks, isSectionBoundary, moveBlocks, removeBlocks, stepBlocks } from "./sections";
import { type SharedSectionData, validateSection } from "../shared-sections";
import { DraftWriter, draftKey, SaveError, type Draft, type SaveAction } from "./draft-writer";
import { FormatBar } from "./format";
import { HistoryPanel } from "./history";
import { BlockOptions, BlockSettings } from "./settings";

type SaveState = "saved" | "dirty" | "saving" | "error";
type PageMeta = Pick<Page, "title" | "description" | "inNav">;

const saveLabels: Record<SaveState, string> = {
  saved: "Entwurf gespeichert",
  dirty: "Nicht gespeichert",
  saving: "Speichert …",
  error: "Speichern fehlgeschlagen",
};

function Editor({ page, site, nav, legal, pages, templates = [], sharedSections = [] }: EditorData) {
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

  const update = (id: string, patch: Partial<Block>) =>
    change((list) => list.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));

  const move = (index: number, delta: -1 | 1) => {
    if (sharedPage && index + delta < 1) return;
    change((list) => stepBlocks(list, index, delta));
  };

  // Moves the block at index `from` so that it lands before the block now at index `to`.
  // Dropping on the upper half of a block puts the dragged one before it, otherwise after it.
  const dropIndex = (event: DragEvent<HTMLElement>, index: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? index : index + 1;
  };

  const moveTo = (from: number, to: number) => change((list) => moveBlocks(list, from, sharedPage ? Math.max(1, to) : to));
  const remove = (id: string) => {
    change((list) => removeBlocks(list, list.findIndex((b) => b.id === id)));
    setSelected(null);
  };
  const duplicate = (index: number) => change((list) => duplicateBlocks(list, index));

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
  const detachShared = () => {
    if (chosen?.type !== "shared" || !chosenShared) return;
    const copies = copyBlocks(chosenShared.liveBlocks ?? chosenShared.page.blocks);
    change((list) => list.flatMap((block) => block.id === chosen.id ? copies : [block]));
    setSelected(copies[0]!.id);
    setNotice(chosenShared.liveBlocks ? "Die veröffentlichte zentrale Fassung ist jetzt eine unabhängige Kopie auf dieser Seite." : "Der zentrale Entwurf ist jetzt eine unabhängige Kopie auf dieser Seite.");
  };
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if ((state !== "saved" || restorePending.current) && !discarding.current) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [save, state]);

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
          <nav aria-label="Seitenaufbau">{blocks.map((block, index) => (isSectionBoundary(block) || block.type === "hero" || index === 0) && <button key={block.id} className={selected === block.id ? "theta-nav-selected" : ""} onClick={() => { setSelected(block.id); setPanel(null); setSide(null); document.getElementById(`block-${block.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{block.type === "hero" ? block.title || "Titelbild" : block.type === "shared" ? `Gemeinsam: ${shared.find((item) => item.page.slug === block.sectionId)?.page.title ?? "Nicht verfügbar"}` : block.type === "section" ? `Abschnitt ${blocks.slice(0, index + 1).filter((b) => b.type === "section").length}` : "Seitenanfang"}</button>)}</nav>
        </aside>
        <div className="theta-canvas">
          {notice && <p className="theta-notice" role="status">{notice}{blockedPreview && <> <a href={`/admin/preview/${encodeURIComponent(page.slug)}`} target="_blank" rel="noopener">Gespeicherten Entwurf ansehen</a></>}</p>}
          {state === "saving" && slowSave && <p className="theta-notice" role="status">Wir warten auf die Bestätigung des Servers. Du kannst weiter schreiben. Dein Text bleibt hier erhalten.</p>}
          {sharedPage && <p className="theta-notice">Du bearbeitest den gemeinsamen Abschnitt „{meta.title}“. Nach der Veröffentlichung verwenden alle eingebundenen Seiten diese Fassung. Deine gespeicherten Änderungen bleiben bis dahin privat.</p>}
          {error && <div className="theta-error-banner" role="alert"><p>{error}</p>{conflict ? <button className="theta-button" onClick={() => { discarding.current = true; window.location.reload(); }}>Eigene Änderungen verwerfen und Serverstand laden</button> : <button className="theta-button" onClick={() => void save()}>Erneut speichern</button>}</div>}
          <div className="theta-format-dock"><FormatBar /><span>Text direkt auf der Seite bearbeiten</span></div>
      <SiteFrame site={site} nav={nav} legal={legal} current={post ? BLOG : page.slug} linkTo={editPath}>
        {post && (
          <p className="t-post-meta">
            {publishedAt ? formatDate(publishedAt ?? new Date().toISOString(), site.language) : "Entwurf, noch nicht veröffentlicht"}
          </p>
        )}
        <BlockFlow blocks={blocks}>
          {(block, index) => {
            const edit = (patch: Partial<Block>) => update(block.id, patch);
            const classes = [
              "theta-block",
              selected === block.id && "theta-selected",
              errorBlock === block.id && "theta-block-error",
              dropAt === index && "theta-drop-before",
              dropAt === index + 1 && index === blocks.length - 1 && "theta-drop-after",
            ];
            return (
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
                <div className="theta-controls">
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
                {block.type === "shared" ? <SharedPreview item={shared.find((item) => item.page.slug === block.sectionId)} /> : <BlockView block={block} edit={edit} />}
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
            );
          }}
        </BlockFlow>

        <div className="theta-add">
          <AddMenu custom={customTemplates} sectionOnly={sharedPage} shared={shared} onShared={(item) => addShared(item, blocks.length)} onAdd={(type) => add(type, blocks.length)} onTemplate={(template) => addTemplate(template, blocks.length)} />
        </div>
      </SiteFrame>
        </div>
        <aside className={`theta-sidebar theta-inspector ${side === "inspector" ? "theta-side-open" : ""}`} aria-label="Einstellungen">
          <div className="theta-publication"><h2>Veröffentlichung</h2><strong>{publishedAt ? "Live-Version vorhanden" : "Noch nicht veröffentlicht"}</strong><p>{savedPage.hasChanges || state !== "saved" ? "Änderungen bleiben im Entwurf, bis du sie veröffentlichst." : "Besucher sehen diese Fassung."}</p>
            {unpublishedShared && <p>Veröffentliche zuerst die eingebundenen gemeinsamen Abschnitte. <button className="theta-button" onClick={() => void refreshShared()}>Zentrale Fassungen aktualisieren</button></p>}
            {sharedPage && <><p>Verwendet auf {sharedUsage.length} {sharedUsage.length === 1 ? "Seite" : "Seiten"}:</p><ul>{sharedUsage.map((item) => <li key={item.slug}><a href={item.href}>{item.title}</a></li>)}</ul></>}
            {publishedAt && page.slug !== HOME && <button className="theta-button" disabled={publishing || conflict || (sharedPage && sharedUsage.length > 0)} onClick={() => void save("unpublish")}>Veröffentlichung zurücknehmen</button>}
          </div>
          {panel === "history" ? <HistoryPanel slug={page.slug} onLoad={loadRevision} /> : panel === "settings" ? <PageSettings page={page} meta={meta} onChange={changeMeta} /> : chosen ? <>
            <h2>{blockLabels[chosen.type]}</h2>
            <BlockOptions block={chosen} allowTitle={!sharedPage} onChange={(patch) => update(chosen.id, patch)} />
            <BlockSettings block={chosen} onChange={(patch) => update(chosen.id, patch)} pages={pages} />
            {chosen.type === "section" && <div className="theta-template-save"><h3>Als Vorlage behalten</h3><label>Name<input value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={200} placeholder="Zum Beispiel: Unser Team" /></label><button className="theta-button" disabled={templateBusy || !templateName.trim()} onClick={() => void saveTemplate()}>Abschnitt speichern</button><p>Eine Vorlage fügt später eine unabhängige Kopie ein.</p></div>}
            {chosen.type === "section" && !sharedPage && <div className="theta-template-save"><h3>Gemeinsam pflegen</h3><label>Name des gemeinsamen Abschnitts<input value={sharedName} onChange={(event) => setSharedName(event.target.value)} maxLength={200} placeholder="Zum Beispiel: Projektanfrage" /></label><button className="theta-button" disabled={sharedBusy || !sharedName.trim() || !canShare} onClick={() => void makeShared()}>Als gemeinsamen Abschnitt anlegen</button><p>Die Einbindung ersetzt diesen Abschnitt im Entwurf. Zentrale Änderungen erscheinen nach der Veröffentlichung auf allen eingebundenen Seiten.</p>{!canShare && <p>Wähle einen Abschnitt mit Inhalt, ohne Titelbild oder Seitentitel.</p>}</div>}
            {chosen.type === "shared" && <div className="theta-settings">
              <p>Hier erscheint die veröffentlichte zentrale Fassung. Du bearbeitest sie einmal für alle eingebundenen Seiten.</p>
              {chosenShared ? <><a className="theta-button" href={editPath(chosenShared.page.slug)} target="_blank" rel="noopener">Zentral bearbeiten</a><button className="theta-button" onClick={() => void refreshShared()}>Zentrale Fassung aktualisieren</button><button className="theta-button" onClick={detachShared}>In unabhängige Kopie umwandeln</button><p>{chosenShared.usage.length} verwendende {chosenShared.usage.length === 1 ? "Seite" : "Seiten"}. {chosenShared.page.hasChanges && "Zentrale Änderungen sind noch im Entwurf."}</p></> : <p>Der Abschnitt ist nicht verfügbar. Entferne die Einbindung oder wähle einen anderen Abschnitt.</p>}
              <label>Gemeinsamen Abschnitt wählen<select value={chosen.sectionId} onChange={(event) => update(chosen.id, { sectionId: event.target.value })}><option value={chosen.sectionId}>{chosenShared?.page.title ?? "Nicht verfügbar"}</option>{shared.filter((item) => item.liveBlocks && item.page.slug !== chosen.sectionId).map((item) => <option key={item.page.slug} value={item.page.slug}>{item.page.title}</option>)}</select></label>
            </div>}
          </> : <><h2>Seite gestalten</h2><p>Wähle einen Block auf der Seite aus, um seine Einstellungen zu sehen.</p></>}
          {savedTemplates.length > 0 && <details className="theta-own-templates"><summary>Eigene Vorlagen ({savedTemplates.length})</summary>{savedTemplates.map((template) => <div key={template.id}><span>{template.title}</span><button className="theta-button" onClick={() => void deleteTemplate(template.id)} aria-label={`Vorlage ${template.title} löschen`}>Löschen</button></div>)}</details>}
        </aside>
      </div>
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

function SharedPreview({ item }: { item?: SharedSectionData }) {
  if (!item) return <p className="theta-notice">Gemeinsamer Abschnitt nicht verfügbar. Wähle eine andere Einbindung oder entferne diesen Block.</p>;
  return <div className="theta-shared-preview">
    <div className="theta-shared-caption"><strong>Gemeinsam: {item.page.title}</strong><span>{item.liveBlocks ? "Veröffentlichte Fassung" : "Noch nicht veröffentlicht · Entwurfsvorschau"}</span><a href={editPath(item.page.slug)} target="_blank" rel="noopener">Zentral bearbeiten</a></div>
    <div className="theta-shared-content" inert><BlockFlow blocks={item.liveBlocks ?? item.page.blocks}>{(block) => <BlockView block={block} />}</BlockFlow></div>
  </div>;
}

type PageSettingsProps = { page: Page; meta: PageMeta; onChange: (patch: Partial<PageMeta>) => void };

function PageSettings({ page, meta, onChange }: PageSettingsProps) {
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
      {page.kind !== "section" && <p className="theta-panel-note">Adresse: {pagePath(page)}</p>}
    </div>
  );
}

const data = JSON.parse(document.getElementById("theta-page")!.textContent!) as EditorData;
createRoot(document.getElementById("theta-editor")!).render(<Editor {...data} />);
