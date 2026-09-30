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
import { type SavedSectionTemplate, type SectionTemplate, insertTemplate, sectionTemplates } from "../templates";
import { blockRange, copyBlocks, duplicateBlocks, moveBlocks, removeBlocks, stepBlocks } from "./sections";
import { DraftWriter, draftKey, SaveError, type SaveAction } from "./draft-writer";
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

function Editor({ page, site, nav, legal, pages, templates = [] }: EditorData) {
  const [blocks, setBlocks] = useState(page.blocks);
  const post = page.kind === "post";
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
  const writer = useRef<DraftWriter | null>(null);
  if (!writer.current) writer.current = new DraftWriter(page);
  const latest = useRef({ ...meta, blocks });
  latest.current = { ...meta, blocks };
  const [panel, setPanel] = useState<"settings" | "history" | null>(null);
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<SaveState>("saved");
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
    setState("dirty");
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

  const move = (index: number, delta: -1 | 1) => change((list) => stepBlocks(list, index, delta));

  // Moves the block at index `from` so that it lands before the block now at index `to`.
  // Dropping on the upper half of a block puts the dragged one before it, otherwise after it.
  const dropIndex = (event: DragEvent<HTMLElement>, index: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? index : index + 1;
  };

  const moveTo = (from: number, to: number) => change((list) => moveBlocks(list, from, to));
  const remove = (id: string) => {
    change((list) => removeBlocks(list, list.findIndex((b) => b.id === id)));
    setSelected(null);
  };
  const duplicate = (index: number) => change((list) => duplicateBlocks(list, index));

  const loadRevision = (revision: Revision) => {
    setBlocks(revision.blocks);
    setMeta((current) => ({ ...current, title: revision.title, description: revision.description, inNav: revision.inNav }));
    touch();
    setPanel(null);
    const when = new Date(revision.createdAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    setNotice(`Version vom ${when} als Entwurf geladen. Veröffentlichen, um sie live zu übernehmen.`);
  };

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

  const save = useCallback(async (action: SaveAction = "save", autosave = false) => {
    setState("saving");
    if (action !== "save") setPublishing(true);
    try {
      const result = await writer.current!.save(() => latest.current, action, autosave);
      setSavedPage(result);
      setErrorBlock(null);
      setError("");
      setNotice(action === "publish" ? "Die gespeicherte Fassung ist jetzt veröffentlicht." : action === "unpublish" ? "Die Seite ist jetzt ein Entwurf." : "");
      setState(draftKey(latest.current) === writer.current!.savedKey ? "saved" : "dirty");
      return true;
    } catch (err) {
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
      setState("error");
      return false;
    } finally { if (action !== "save") setPublishing(false); }
  }, []);

  useEffect(() => {
    if (state !== "dirty" || conflict || publishing) return;
    const timer = window.setTimeout(() => { void save("save", true); }, 1000);
    return () => window.clearTimeout(timer);
  }, [blocks, meta, state, conflict, publishing, save]);

  const preview = async () => {
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    if (await save()) {
      if (win) win.location.href = `/admin/preview/${encodeURIComponent(page.slug)}`;
    } else win?.close();
  };

  const chosenIndex = blocks.findIndex((block) => block.id === selected);
  const chosen = blocks[chosenIndex];
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
  const customTemplates: SectionTemplate[] = savedTemplates.map((template) => ({ id: template.id, label: template.title, hint: "Eigene Abschnittsvorlage", blocks: () => copyBlocks(template.blocks) }));
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
      if (state !== "saved" && !discarding.current) event.preventDefault();
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
        <a className="theta-logo" href={post ? "/admin/blog" : "/admin"}>
          θ Übersicht
        </a>
        <button className="theta-button theta-mobile-toggle" onClick={() => setSide(side === "pages" ? null : "pages")} aria-expanded={side === "pages"}>Seiten</button>
        <button className="theta-button theta-mobile-toggle" onClick={() => setSide(side === "inspector" ? null : "inspector")} aria-expanded={side === "inspector"}>Einstellungen</button>
        <span className={`theta-status theta-status-${state}`} role="status" aria-live="polite" title={error || undefined}>
          {saveLabels[state]}
        </span>
        <button className="theta-button" onClick={() => { togglePanel("history"); setSide("inspector"); }} aria-expanded={panel === "history"}>
          Verlauf
        </button>
        <button className="theta-button" onClick={() => { togglePanel("settings"); setSide("inspector"); }} aria-expanded={panel === "settings"}>
          {post ? "Beitragseinstellungen" : "Seiteneinstellungen"}
        </button>
        {publishedAt && (
          <a className="theta-button" href={pagePath(page)} target="_blank" rel="noopener">
            Ansehen
          </a>
        )}
        <button className="theta-button" onClick={() => void save()} disabled={state === "saving" || state === "saved" || conflict}>
          Speichern
        </button>
        <button className="theta-button" onClick={() => void preview()} disabled={conflict || publishing}>Vorschau</button>
        <button className="theta-button theta-primary" onClick={() => void save("publish")} disabled={publishing || conflict || (state === "saved" && !savedPage.hasChanges)}>Veröffentlichen</button>
        <form method="post" action="/logout">
          <button className="theta-button" type="submit">
            Abmelden
          </button>
        </form>
      </header>

      <div className="theta-workbench">
        <aside className={`theta-sidebar theta-navigation ${side === "pages" ? "theta-side-open" : ""}`} aria-label="Seiten und Abschnitte">
          <h2>Deine Website</h2>
          <nav>{pages.filter((p) => p.slug !== BLOG).map((p) => <a key={p.slug} href={editPath(p.slug)} aria-current={p.slug === page.slug ? "page" : undefined}>{p.title}</a>)}</nav>
          <div className="theta-nav-links"><a href="/admin">Seiten verwalten</a><a href="/admin/media">Mediathek</a><a href="/admin/design">Design</a><a href="/admin/trash">Papierkorb</a></div>
          <h2>Auf dieser Seite</h2>
          <nav aria-label="Seitenaufbau">{blocks.map((block, index) => (block.type === "section" || block.type === "hero" || index === 0) && <button key={block.id} className={selected === block.id ? "theta-nav-selected" : ""} onClick={() => { setSelected(block.id); setPanel(null); setSide(null); document.getElementById(`block-${block.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{block.type === "hero" ? block.title || "Titelbild" : block.type === "section" ? `Abschnitt ${blocks.slice(0, index + 1).filter((b) => b.type === "section").length}` : "Seitenanfang"}</button>)}</nav>
        </aside>
        <div className="theta-canvas">
          {notice && <p className="theta-notice" role="status">{notice}</p>}
          {error && <div className="theta-error-banner" role="alert"><p>{error}</p>{conflict ? <button className="theta-button" onClick={() => { discarding.current = true; window.location.reload(); }}>Eigene Änderungen verwerfen und Serverstand laden</button> : <button className="theta-button" onClick={() => void save()}>Erneut speichern</button>}</div>}
          <div className="theta-format-dock"><FormatBar /><span>Text direkt auf der Seite bearbeiten</span></div>
      <SiteFrame site={site} nav={nav} legal={legal} current={post ? BLOG : page.slug} linkTo={editPath}>
        {post && (
          <p className="t-post-meta">
            {publishedAt ? formatDate(publishedAt ?? new Date().toISOString()) : "Entwurf, noch nicht veröffentlicht"}
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
                  <span
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
                  <button onClick={() => move(index, -1)} disabled={block.type === "section" ? !blocks.slice(0, index).some((b) => b.type === "section") : index === 0} aria-label="Nach oben">
                    ↑
                  </button>
                  <button onClick={() => move(index, 1)} disabled={block.type === "section" ? !blocks.slice(index + 1).some((b) => b.type === "section") : index === blocks.length - 1} aria-label="Nach unten">
                    ↓
                  </button>
                  <button onClick={() => duplicate(index)} aria-label={block.type === "section" ? "Abschnitt verdoppeln" : "Block verdoppeln"} title="Verdoppeln">
                    ⧉
                  </button>
                  <button onClick={() => remove(block.id)} aria-label={block.type === "section" ? "Abschnitt mit Inhalt löschen" : "Block löschen"}>
                    ✕
                  </button>
                </div>
                <BlockView block={block} edit={edit} />
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
                {adding === index + 1 && <AddMenu custom={customTemplates}
                    onAdd={(type) => add(type, index + 1)}
                    onTemplate={(template) => addTemplate(template, index + 1)}
                    onClose={() => setAdding(null)}
                  />}
              </section>
            );
          }}
        </BlockFlow>

        <div className="theta-add">
          <AddMenu custom={customTemplates} onAdd={(type) => add(type, blocks.length)} onTemplate={(template) => addTemplate(template, blocks.length)} />
        </div>
      </SiteFrame>
        </div>
        <aside className={`theta-sidebar theta-inspector ${side === "inspector" ? "theta-side-open" : ""}`} aria-label="Einstellungen">
          <div className="theta-publication"><h2>Veröffentlichung</h2><strong>{publishedAt ? "Live-Version vorhanden" : "Noch nicht veröffentlicht"}</strong><p>{savedPage.hasChanges || state !== "saved" ? "Änderungen bleiben im Entwurf, bis du sie veröffentlichst." : "Besucher sehen diese Fassung."}</p>
            {publishedAt && page.slug !== HOME && <button className="theta-button" disabled={publishing || conflict} onClick={() => void save("unpublish")}>Veröffentlichung zurücknehmen</button>}
          </div>
          {panel === "history" ? <HistoryPanel slug={page.slug} onLoad={loadRevision} /> : panel === "settings" ? <PageSettings page={page} meta={meta} onChange={changeMeta} /> : chosen ? <>
            <h2>{blockLabels[chosen.type]}</h2>
            <BlockOptions block={chosen} onChange={(patch) => update(chosen.id, patch)} />
            <BlockSettings block={chosen} onChange={(patch) => update(chosen.id, patch)} pages={pages} />
            {chosen.type === "section" && <div className="theta-template-save"><h3>Als Vorlage behalten</h3><label>Name<input value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={200} placeholder="Zum Beispiel: Unser Team" /></label><button className="theta-button" disabled={templateBusy || !templateName.trim()} onClick={() => void saveTemplate()}>Abschnitt speichern</button><p>Eine Vorlage fügt später eine unabhängige Kopie ein.</p></div>}
          </> : <><h2>Seite gestalten</h2><p>Wähle einen Block auf der Seite aus, um seine Einstellungen zu sehen.</p></>}
          {savedTemplates.length > 0 && <details className="theta-own-templates"><summary>Eigene Vorlagen ({savedTemplates.length})</summary>{savedTemplates.map((template) => <div key={template.id}><span>{template.title}</span><button className="theta-button" onClick={() => void deleteTemplate(template.id)} aria-label={`Vorlage ${template.title} löschen`}>Löschen</button></div>)}</details>}
        </aside>
      </div>
    </div>
  );
}

// The block types in the order people need them most.
const favourites: BlockType[] = ["heading", "text", "image", "hero", "section", "columns", "button", "gallery", "quote", "video", "divider"];
const addOrder = [...favourites, ...(Object.keys(blockLabels) as BlockType[]).filter((type) => !favourites.includes(type))];

type AddMenuProps = { custom?: SectionTemplate[]; onAdd: (type: BlockType) => void; onTemplate: (template: SectionTemplate) => void; onClose?: () => void };

function AddMenu({ custom = [], onAdd, onTemplate, onClose }: AddMenuProps) {
  return (
    <div
      className="theta-add-menu"
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.key === "Escape" && onClose?.()}
    >
      <div className="theta-add-group">
        {addOrder.map((type) => (
          <button key={type} className="theta-button" role="menuitem" onClick={() => onAdd(type)}>
            + {blockLabels[type]}
          </button>
        ))}
        {onClose && (
          <button className="theta-button" onClick={onClose}>
            Abbrechen
          </button>
        )}
      </div>
      <div className="theta-add-group">
        <span className="theta-add-heading">Fertige Abschnitte</span>
        {[...custom, ...sectionTemplates].map((template) => (
          <button key={template.id} className="theta-button theta-template" role="menuitem" title={template.hint} onClick={() => onTemplate(template)}>
            {template.label}
          </button>
        ))}
      </div>
    </div>
  );
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
        Beschreibung für Suchmaschinen
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
      <p className="theta-panel-note">Adresse: {pagePath(page)}</p>
    </div>
  );
}

const data = JSON.parse(document.getElementById("theta-page")!.textContent!) as EditorData;
createRoot(document.getElementById("theta-editor")!).render(<Editor {...data} />);
