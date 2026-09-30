import { useEffect, useState } from "react";
import type { Revision, RevisionSummary } from "../blocks";

// Earlier saved versions. Restore preserves the current draft first and keeps the
// selected version private until the user explicitly publishes it.

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function HistoryPanel({ slug, onLoad }: { slug: string; onLoad: (revision: Revision) => Promise<void> }) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/pages/${encodeURIComponent(slug)}/revisions`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then((list: RevisionSummary[]) => setRevisions(list))
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  const load = async (id: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(slug)}/revisions/${id}`);
      if (!res.ok) throw new Error(res.statusText);
      await onLoad((await res.json()) as Revision);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };

  return (
    <div className="theta-panel">
      <strong>Verlauf</strong>
      {error && <p className="theta-hint">{error}</p>}
      {revisions === null ? (
        <p className="theta-panel-note">Lädt …</p>
      ) : revisions.length === 0 ? (
        <p className="theta-panel-note">Noch keine gespeicherten Versionen. Jedes Speichern legt eine an.</p>
      ) : (
        <ol className="theta-history">
          {revisions.map((revision, index) => (
            <li key={revision.id}>
              <span>
                {formatTime(revision.createdAt)}
                {revision.author && ` · ${revision.author}`}
                {index === 0 && " · aktuell"}
              </span>
              {index > 0 && (
                <button className="theta-button" disabled={loading} onClick={() => void load(revision.id)}>
                  Diese Version laden
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
