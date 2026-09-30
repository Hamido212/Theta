import { useCallback, useEffect, useRef, useState } from "react";
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

function Editor({ page, site, nav, pages }: EditorData) {
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

  const remove = (id: string) => change((list) => list.filter((b) => b.id !== id));

  const loadRevision = (revision: Revision) => {
    setBlocks(revision.blocks);
    setMeta((current) => ({ ...current, title: revision.title, description: revision.description, inNav: revision.inNav }));
    touch();
    setPanel(null);
    const when = new Date(revision.createdAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    setNotice(`Version vom ${when} geladen. Speichern, um sie wiederherzustellen, oder Seite neu laden, um sie zu verwerfen.`);
  };

  const togglePanel = (name: "settings" | "history") => setPanel((open) => (open === name ? null : name));
  const add = (type: BlockType) => change((list) => [...list, newBlock(type)]);

  const save = useCallback(async () => {
    const saving = version.current;
    setState("saving");
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(page.slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...meta, blocks }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? res.statusText);
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

      <SiteFrame site={site} nav={nav} current={post ? BLOG : page.slug} linkTo={editPath}>
        {post && (
          <p className="t-post-meta">
            {meta.published ? formatDate(publishedAt ?? new Date().toISOString()) : "Entwurf, noch nicht veröffentlicht"}
          </p>
        )}
        <BlockFlow blocks={blocks}>
          {(block, index) => (
            <section key={block.id} className="theta-block" aria-label={blockLabels[block.type]}>
              <div className="theta-controls">
                <span className="theta-block-label">{blockLabels[block.type]}</span>
                <BlockOptions block={block} onChange={(patch) => update(block.id, patch)} />
                <button onClick={() => move(index, -1)} disabled={index === 0} aria-label="Nach oben">
                  ↑
                </button>
                <button onClick={() => move(index, 1)} disabled={index === blocks.length - 1} aria-label="Nach unten">
                  ↓
                </button>
                <button onClick={() => remove(block.id)} aria-label="Block löschen">
                  ✕
                </button>
              </div>
              <BlockView block={block} edit={(patch) => update(block.id, patch)} />
              <BlockSettings block={block} onChange={(patch) => update(block.id, patch)} pages={pages} />
            </section>
          )}
        </BlockFlow>

        <div className="theta-add">
          {(Object.keys(blockLabels) as BlockType[]).map((type) => (
            <button key={type} className="theta-button" onClick={() => add(type)}>
              + {blockLabels[type]}
            </button>
          ))}
        </div>
      </SiteFrame>
    </>
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
