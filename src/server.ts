import { join } from "node:path";
import { Hono } from "hono";
import { ValidationError, parseBlocks } from "./blocks";
import { renderEditor, renderPage } from "./render";
import { PageStore } from "./store";

const HOME = "home";

// Bundles the browser editor once, on first request.
let editorBundle: Promise<string> | undefined;
function buildEditor(): Promise<string> {
  editorBundle ??= Bun.build({
    entrypoints: [join(import.meta.dir, "editor", "main.tsx")],
    target: "browser",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  }).then((result) => {
    if (!result.success || !result.outputs[0]) {
      editorBundle = undefined;
      throw new AggregateError(result.logs, "Editor konnte nicht gebaut werden");
    }
    return result.outputs[0].text();
  });
  return editorBundle;
}

const asset = (path: string) => Bun.file(new URL(path, import.meta.url));

export function createApp(store: PageStore) {
  const app = new Hono();

  app.get("/", (c) => c.html(renderPage(store.get(HOME)!)));

  // Prototype: the editor has no login yet, which is why the server only listens on localhost.
  app.get("/edit", (c) => c.html(renderEditor(store.get(HOME)!)));

  app.get("/api/pages/:slug", (c) => {
    const page = store.get(c.req.param("slug"));
    return page ? c.json(page) : c.json({ error: "Seite nicht gefunden" }, 404);
  });

  app.put("/api/pages/:slug", async (c) => {
    const page = store.get(c.req.param("slug"));
    if (!page) return c.json({ error: "Seite nicht gefunden" }, 404);

    const body = (await c.req.json().catch(() => null)) as { title?: unknown; blocks?: unknown } | null;
    if (!body) return c.json({ error: "Ungültiges JSON" }, 400);
    try {
      const title = body.title === undefined ? page.title : parseTitle(body.title);
      return c.json(store.save(page.slug, { title, blocks: parseBlocks(body.blocks) }));
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.get("/assets/theme.css", (c) => c.body(asset("./theme/theme.css").stream(), 200, { "content-type": "text/css; charset=utf-8" }));
  app.get("/assets/editor.css", (c) => c.body(asset("./editor/editor.css").stream(), 200, { "content-type": "text/css; charset=utf-8" }));
  app.get("/assets/editor.js", async (c) => c.body(await buildEditor(), 200, { "content-type": "text/javascript; charset=utf-8" }));

  app.get("/media/:name", async (c) => {
    const name = c.req.param("name");
    if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) return c.notFound();
    const file = Bun.file(new URL(`../media/${name}`, import.meta.url));
    if (!(await file.exists())) return c.notFound();
    return new Response(file);
  });

  return app;
}

function parseTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 200) {
    throw new ValidationError("title muss Text mit 1 bis 200 Zeichen sein");
  }
  return value.trim();
}

if (import.meta.main) {
  const store = new PageStore(process.env.THETA_DB ?? "theta.db");
  const server = Bun.serve({
    hostname: process.env.THETA_HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
    fetch: createApp(store).fetch,
  });
  console.log(`Theta läuft auf ${server.url}`);
  console.log(`Bearbeiten: ${new URL("/edit", server.url)}`);
}
