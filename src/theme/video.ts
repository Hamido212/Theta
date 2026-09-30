// Turns a pasted video address into something the theme can embed.

export type VideoSource =
  | { kind: "youtube"; id: string; embed: string }
  | { kind: "vimeo"; id: string; embed: string }
  | { kind: "file"; src: string };

export function videoSource(url: string): VideoSource | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^(https?:\/\/[^?#]+|\/[^/][^?#]*)\.(mp4|webm|ogv|ogg)([?#].*)?$/i.test(trimmed)) {
    return { kind: "file", src: trimmed };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www\.|m\.)/, "");

  let youtube: string | null | undefined;
  if (host === "youtu.be") youtube = parsed.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    youtube = parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
  }
  if (youtube && /^[\w-]{11}$/.test(youtube)) {
    // youtube-nocookie avoids tracking cookies until the video is actually played.
    return { kind: "youtube", id: youtube, embed: `https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1` };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parsed.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/)?.[1];
    if (id) return { kind: "vimeo", id, embed: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1` };
  }
  return null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A click-to-play placeholder shown inside the iframe. Nothing is loaded from the video
// platform until the visitor clicks, which keeps the page fast and privacy friendly (DSGVO).
export function videoPlaceholder(source: { kind: "youtube" | "vimeo"; embed: string }, title: string): string {
  const platform = source.kind === "youtube" ? "YouTube" : "Vimeo";
  return `<!doctype html><meta charset="utf-8"><style>
html,body{height:100%;margin:0}
a{box-sizing:border-box;height:100%;display:grid;place-content:center;justify-items:center;gap:12px;padding:16px;
background:#18171c;color:#fff;font:16px/1.4 system-ui,sans-serif;text-align:center;text-decoration:none}
b{display:grid;place-items:center;width:72px;height:50px;border-radius:14px;background:#fff;color:#18171c;font-size:22px}
small{max-width:30em;opacity:.7}
</style><a href="${escapeHtml(source.embed)}"><b aria-hidden="true">▶</b><span>${escapeHtml(title || "Video abspielen")}</span><small>Beim Abspielen werden Daten an ${platform} übertragen.</small></a>`;
}
