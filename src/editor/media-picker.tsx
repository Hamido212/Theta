import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../media";

// A dialog to pick uploaded images or upload new ones without leaving the editor.

type Props = {
  multiple?: boolean;
  label: string;
  onSelect: (items: MediaItem[]) => void;
};

export function MediaPicker({ multiple = false, label, onSelect }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async () => {
    setSelected([]);
    setError("");
    dialog.current?.showModal();
    try {
      setItems(await request<MediaItem[]>("/api/media"));
    } catch (err) {
      setError(message(err));
    }
  };

  const close = () => dialog.current?.close();

  const finish = (chosen: MediaItem[]) => {
    if (chosen.length > 0) onSelect(chosen);
    close();
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const body = new FormData();
    for (const file of files) body.append("file", file);
    setBusy(true);
    setError("");
    try {
      const added = await request<MediaItem[]>("/api/media", { method: "POST", body });
      setItems((current) => [...added, ...(current ?? [])]);
      if (multiple) setSelected((current) => [...current, ...added.map((item) => item.id)]);
      else finish(added.slice(0, 1));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const pick = (item: MediaItem) => {
    if (!multiple) return finish([item]);
    setSelected((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]));
  };

  useEffect(() => {
    const el = dialog.current;
    const onClick = (event: MouseEvent) => {
      if (event.target === el) close(); // click on the backdrop
    };
    el?.addEventListener("click", onClick);
    return () => el?.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      <button className="theta-button" onClick={open}>
        {label}
      </button>
      <dialog ref={dialog} className="theta-dialog" aria-label="Mediathek">
        <header>
          <strong>Mediathek</strong>
          <label className={`theta-button theta-primary${busy ? " theta-busy" : ""}`}>
            {busy ? "Lädt hoch …" : "Hochladen"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              multiple={multiple}
              hidden
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <button className="theta-button" onClick={close}>
            Schließen
          </button>
        </header>
        {error && <p className="theta-hint">{error}</p>}
        {items === null ? (
          <p className="theta-note">Lädt …</p>
        ) : items.length === 0 ? (
          <p className="theta-note">Noch keine Bilder. Lade oben dein erstes Bild hoch.</p>
        ) : (
          <ul className="theta-media">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className={selected.includes(item.id) ? "theta-selected" : undefined}
                  onClick={() => pick(item)}
                  aria-pressed={multiple ? selected.includes(item.id) : undefined}
                  title={item.filename}
                >
                  <img src={item.thumb} alt={item.filename} loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {multiple && (
          <footer>
            <button
              className="theta-button theta-primary"
              disabled={selected.length === 0}
              onClick={() => finish(selected.map((id) => items!.find((item) => item.id === id)!))}
            >
              {selected.length === 1 ? "1 Bild hinzufügen" : `${selected.length} Bilder hinzufügen`}
            </button>
          </footer>
        )}
      </dialog>
    </>
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? (res.status === 413 ? "Die Dateien sind zu groß" : res.statusText));
  return data as T;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
