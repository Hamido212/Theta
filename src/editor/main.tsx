import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Block, type BlockType, type ImageBlock, type Page, blockLabels, newBlock } from "../blocks";
import { BlockView } from "../theme/blocks";

type SaveState = "saved" | "dirty" | "saving" | "error";

const saveLabels: Record<SaveState, string> = {
  saved: "Gespeichert",
  dirty: "Nicht gespeichert",
  saving: "Speichert …",
  error: "Speichern fehlgeschlagen",
};

function Editor({ initial }: { initial: Page }) {
  const [blocks, setBlocks] = useState(initial.blocks);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  // Counts edits, so a save that finishes after further typing does not report "saved".
  const version = useRef(0);

  const change = (next: (blocks: Block[]) => Block[]) => {
    version.current++;
    setBlocks(next);
    setState("dirty");
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
  const add = (type: BlockType) => change((list) => [...list, newBlock(type)]);

  const save = useCallback(async () => {
    const saving = version.current;
    setState("saving");
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(initial.slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? res.statusText);
      setError("");
      setState(version.current === saving ? "saved" : "dirty");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, [blocks, initial.slug]);

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
        <strong className="theta-logo">θ Theta</strong>
        <span className={`theta-status theta-status-${state}`} title={error || undefined}>
          {saveLabels[state]}
          {error && `: ${error}`}
        </span>
        <a className="theta-button" href="/" target="_blank" rel="noopener">
          Ansehen
        </a>
        <button className="theta-button theta-primary" onClick={save} disabled={state === "saving" || state === "saved"}>
          Speichern
        </button>
        <form method="post" action="/logout">
          <button className="theta-button" type="submit">
            Abmelden
          </button>
        </form>
      </header>

      <main className="t-page">
        {blocks.map((block, index) => (
          <section key={block.id} className="theta-block" aria-label={blockLabels[block.type]}>
            <div className="theta-controls">
              <span className="theta-block-label">{blockLabels[block.type]}</span>
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
            {block.type === "image" && <ImageSettings block={block} onChange={(patch) => update(block.id, patch)} />}
          </section>
        ))}

        <div className="theta-add">
          {(Object.keys(blockLabels) as BlockType[]).map((type) => (
            <button key={type} className="theta-button" onClick={() => add(type)}>
              + {blockLabels[type]}
            </button>
          ))}
        </div>
      </main>
    </>
  );
}

function ImageSettings({ block, onChange }: { block: ImageBlock; onChange: (patch: Partial<ImageBlock>) => void }) {
  return (
    <div className="theta-settings">
      <label>
        Bild-Adresse
        <input
          type="url"
          value={block.src}
          placeholder="https://… oder /media/…"
          onChange={(e) => onChange({ src: e.target.value })}
        />
      </label>
      <label>
        Bildbeschreibung
        <input
          value={block.alt}
          placeholder="Was ist auf dem Bild zu sehen?"
          onChange={(e) => onChange({ alt: e.target.value })}
        />
      </label>
      {block.src && !block.alt.trim() && (
        <p className="theta-hint">Ohne Beschreibung können blinde Menschen und Suchmaschinen das Bild nicht erfassen.</p>
      )}
    </div>
  );
}

const page = JSON.parse(document.getElementById("theta-page")!.textContent!) as Page;
createRoot(document.getElementById("theta-editor")!).render(<Editor initial={page} />);
