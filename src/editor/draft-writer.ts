import { type Block, type Page, parseBlocks } from "../blocks";

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
    return this.ordered(() => this.saveDraft(current(), action, autosave));
  }

  // Preserve the draft being left, including unsaved edits, before applying history.
  // Both requests share one queue slot so a queued publication cannot get between them.
  async restore(current: () => Draft, revision: Draft): Promise<Page> {
    const restored = structuredClone(revision);
    return this.ordered(async () => {
      await this.saveDraft(current(), "save", false);
      return this.saveDraft(restored, "save", false);
    });
  }

  private async ordered(operation: () => Promise<Page>): Promise<Page> {
    while (this.pending) await this.pending;
    if (this.conflict) throw new SaveError("Die Seite wurde anderswo geändert. Lade den Serverstand; dein Text bleibt bis dahin hier erhalten.", true);
    const pending = operation();
    this.pending = pending;
    try { return await pending; }
    finally { this.pending = null; }
  }

  private saveDraft(draft: Draft, action: SaveAction, autosave: boolean): Promise<Page> {
    const key = draftKey(draft);
    if (action === "save" && key === this.savedKey) return Promise.resolve(this.page);
    return this.write(draft, key, action, autosave);
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
    if (!isPageResponse(data, this.page)) throw new SaveError("Der Server hat das Speichern nicht bestätigt. Dein Text bleibt hier erhalten; prüfe die Verbindung und versuche es erneut.");
    this.page = data;
    // Use the sent payload, not a newer edit or the server's normalized copy.
    this.savedKey = key;
    return this.page;
  }
}

function isPageResponse(value: unknown, previous: Page): value is Page {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<Page>;
  const valid = page.slug === previous.slug && page.kind === previous.kind &&
    typeof page.version === "number" && Number.isSafeInteger(page.version) && page.version >= previous.version &&
    typeof page.title === "string" && typeof page.description === "string" && typeof page.inNav === "boolean" &&
    Array.isArray(page.blocks) && typeof page.updatedAt === "string" && typeof page.hasChanges === "boolean" &&
    (page.publishedAt === null || typeof page.publishedAt === "string") &&
    (page.deletedAt === null || typeof page.deletedAt === "string");
  if (!valid) return false;
  try { parseBlocks(page.blocks); return true; }
  catch { return false; }
}

export const draftKey = (draft: Draft) => JSON.stringify({ title: draft.title, description: draft.description, inNav: draft.inNav, blocks: draft.blocks });
