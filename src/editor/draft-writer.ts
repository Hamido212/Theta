import type { Block, Page } from "../blocks";

export type Draft = { title: string; description: string; inNav: boolean; blocks: Block[] };
export type SaveAction = "save" | "publish" | "unpublish";
export class SaveError extends Error {
  constructor(message: string, readonly conflict = false, readonly block?: number) { super(message); }
}

// A single writer orders autosave and publication. Each request reads the latest
// local payload only after the previous request has supplied its new server version.
export class DraftWriter {
  page: Page;
  savedKey: string;
  conflict = false;
  private pending: Promise<Page> | null = null;

  constructor(page: Page, private request: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init)) {
    this.page = page;
    this.savedKey = draftKey(page);
  }

  async save(current: () => Draft, action: SaveAction = "save", autosave = false): Promise<Page> {
    while (this.pending) await this.pending;
    if (this.conflict) throw new SaveError("Die Seite wurde anderswo geändert. Lade den Serverstand; dein Text bleibt bis dahin hier erhalten.", true);
    const draft = current();
    const key = draftKey(draft);
    if (action === "save" && key === this.savedKey) return this.page;
    const operation = this.write(draft, key, action, autosave);
    this.pending = operation;
    try { return await operation; }
    finally { this.pending = null; }
  }

  private async write(draft: Draft, key: string, action: SaveAction, autosave: boolean): Promise<Page> {
    const res = await this.request(`/api/pages/${encodeURIComponent(this.page.slug)}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, version: this.page.version, action, autosave }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      this.conflict = res.status === 409;
      throw new SaveError(data?.error ?? "Speichern nicht möglich. Prüfe deine Verbindung und versuche es erneut.", this.conflict, data?.block);
    }
    this.page = data as Page;
    // Use the sent payload, not a newer edit or the server's normalized copy.
    this.savedKey = key;
    return this.page;
  }
}

export const draftKey = (draft: Draft) => JSON.stringify({ title: draft.title, description: draft.description, inNav: draft.inNav, blocks: draft.blocks });
