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
import { type SectionTemplate, insertTemplate, sectionTemplates } from "../templates";
import { FormatBar } from "./format";
import { HistoryPanel } from "./history";
import { BlockOptions, BlockSettings } from "./settings";

type SaveState = "saved" | "dirty" | "saving" | "error";
type PageMeta = Pick<Page, "title" | "description" | "inNav"> & { published: boolean };

const saveLabels: Record<SaveState, string> = {
  saved: "Gespeichert",
  dirty: "Nicht gespeichert",
  saving: "Speichert …",
  error: "Speichern fehlgeschlagen",
};

function Editor({ page, site, nav, legal, pages }: EditorData) {
  const [blocks, setBlocks] = useState(page.blocks);
  const post = page.kind === "post";
  const [meta, setMeta] = useState<PageMeta>({
    title: page.title,
    description: page.description,
    inNav: page.inNav,
    published: page.publishedAt !== null,
  });
  // When the saved post went public; null for drafts. Only published pages can be viewed.
  const [publishedAt, setPublishedAt] = useState(page.publishedAt);
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
  // Counts edits, so a save that finishes after further typing does not report "saved".
  const version = useRef(0);

  const touch = () => {
    version.current++;
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

  const move = (index: number, delta: -1 | 1) =>
    change((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });

  // Moves the block at index `from` so that it lands before the block now at index `to`.
  // Dropping on the upper half of a block puts the dragged one before it, otherwise after it.
  const dropIndex = (event: DragEvent<HTMLElement>, index: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? index : index + 1;
  };

  const moveTo = (from: number, to: number) =>
    change((list) => {
      if (to === from || to === from + 1) return list;
      const copy = [...list];
      const [block] = copy.splice(from, 1);
      copy.splice(to > from ? to - 1 : to, 0, block!);
      return copy;
    });

  const remove = (id: string) => change((list) => list.filter((b) => b.id !== id));

  const duplicate = (index: number) =>
    change((list) => {
      const copy = structuredClone(list[index]!);
      copy.id = crypto.randomUUID();
      return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
    });

  const loadRevision = (revision: Revision) => {
    setBlocks(revision.blocks);
    setMeta((current) => ({ ...current, title: revision.title, description: revision.description, inNav: revision.inNav }));
    touch();
    setPanel(null);
    const when = new Date(revision.createdAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    setNotice(`Version vom ${when} geladen. Speichern, um sie wiederherzustellen, oder Seite neu laden, um sie zu verwerfen.`);
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

  const save = useCallback(async () => {
    const saving = version.current;
    setState("saving");
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(page.slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...meta, blocks }),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { error?: string; block?: number } | null;
        const bad = problem?.block === undefined ? null : (blocks[problem.block]?.id ?? null);
        setErrorBlock(bad);
        if (bad) {
          setSelected(bad);
          document.getElementById(`block-${bad}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        throw new Error(problem?.error ?? res.statusText);
      }
      setErrorBlock(null);
      setPublishedAt(((await res.json()) as Page).publishedAt);
      setError("");
      setNotice("");
      setState(version.current === saving ? "saved" : "dirty");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, [blocks, meta, page.slug]);

  // Ctrl/Cmd + S saves, and leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "error") event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [save, state]);

  return (
    <>
      <header className="theta-bar">
        <a className="theta-logo" href={post ? "/admin/blog" : "/admin"}>
          θ Übersicht
        </a>
        <FormatBar />
        <span className={`theta-status theta-status-${state}`} title={error || undefined}>
          {saveLabels[state]}
          {error && `: ${error}`}
        </span>
        <button className="theta-button" onClick={() => togglePanel("history")} aria-expanded={panel === "history"}>
          Verlauf
        </button>
        <button className="theta-button" onClick={() => togglePanel("settings")} aria-expanded={panel === "settings"}>
          {post ? "Beitragseinstellungen" : "Seiteneinstellungen"}
        </button>
        {(!post || publishedAt) && (
          <a className="theta-button" href={pagePath(page)} target="_blank" rel="noopener">
            Ansehen
          </a>
        )}
        <button className="theta-button theta-primary" onClick={save} disabled={state === "saving" || state === "saved"}>
          Speichern
        </button>
        <form method="post" action="/logout">
          <button className="theta-button" type="submit">
            Abmelden
          </button>
        </form>
      </header>

      {panel === "settings" && <PageSettings page={page} meta={meta} onChange={changeMeta} />}
      {panel === "history" && <HistoryPanel slug={page.slug} onLoad={loadRevision} />}
      {notice && <p className="theta-notice">{notice}</p>}

      <SiteFrame site={site} nav={nav} legal={legal} current={post ? BLOG : page.slug} linkTo={editPath}>
        {post && (
          <p className="t-post-meta">
            {meta.published ? formatDate(publishedAt ?? new Date().toISOString()) : "Entwurf, noch nicht veröffentlicht"}
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
                onFocus={() => setSelected(block.id)}
                onClick={() => setSelected(block.id)}
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
                  <BlockOptions block={block} onChange={edit} />
                  <button onClick={() => move(index, -1)} disabled={index === 0} aria-label="Nach oben">
                    ↑
                  </button>
                  <button onClick={() => move(index, 1)} disabled={index === blocks.length - 1} aria-label="Nach unten">
                    ↓
                  </button>
                  <button onClick={() => duplicate(index)} aria-label="Block verdoppeln" title="Verdoppeln">
                    ⧉
                  </button>
                  <button onClick={() => remove(block.id)} aria-label="Block löschen">
                    ✕
                  </button>
                </div>
                <BlockView block={block} edit={edit} />
                {selected === block.id && <BlockSettings block={block} onChange={edit} pages={pages} />}
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
                {adding === index + 1 && <AddMenu
                    onAdd={(type) => add(type, index + 1)}
                    onTemplate={(template) => addTemplate(template, index + 1)}
                    onClose={() => setAdding(null)}
                  />}
              </section>
            );
          }}
        </BlockFlow>

        <div className="theta-add">
          <AddMenu onAdd={(type) => add(type, blocks.length)} onTemplate={(template) => addTemplate(template, blocks.length)} />
        </div>
      </SiteFrame>
    </>
  );
}

// The block types in the order people need them most.
const favourites: BlockType[] = ["heading", "text", "image", "hero", "section", "columns", "button", "gallery", "quote", "video", "divider"];
const addOrder = [...favourites, ...(Object.keys(blockLabels) as BlockType[]).filter((type) => !favourites.includes(type))];

type AddMenuProps = { onAdd: (type: BlockType) => void; onTemplate: (template: SectionTemplate) => void; onClose?: () => void };

function AddMenu({ onAdd, onTemplate, onClose }: AddMenuProps) {
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
        {sectionTemplates.map((template) => (
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
      {page.kind === "post" ? (
        <label className="theta-check">
          <input type="checkbox" checked={meta.published} onChange={(e) => onChange({ published: e.target.checked })} />
          Veröffentlicht (nach dem Speichern im Blog sichtbar)
        </label>
      ) : (
        page.slug !== HOME && (
          <label className="theta-check">
            <input type="checkbox" checked={meta.inNav} onChange={(e) => onChange({ inNav: e.target.checked })} />
            Im Menü anzeigen
          </label>
        )
      )}
      <p className="theta-panel-note">Adresse: {pagePath(page)}</p>
    </div>
  );
}

const data = JSON.parse(document.getElementById("theta-page")!.textContent!) as EditorData;
createRoot(document.getElementById("theta-editor")!).render(<Editor {...data} />);
