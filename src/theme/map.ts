// Maps from OpenStreetMap. Nothing is loaded from OpenStreetMap until a visitor clicks,
// the same way videos wait for a click: the page stays fast and no data leaves it unasked (DSGVO).

export type Location = { lat: number; lon: number; zoom?: number };

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

const round = (value: number) => Math.round(value * 1e6) / 1e6;

const valid = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

function location(lat: string | number | undefined, lon: string | number | undefined, zoom?: string | number): Location | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (lat === undefined || lon === undefined || lat === "" || lon === "" || !valid(la, lo)) return null;
  const z = Math.round(Number(zoom));
  return { lat: round(la), lon: round(lo), ...(zoom !== undefined && z >= MIN_ZOOM && z <= MAX_ZOOM ? { zoom: z } : {}) };
}

// Understands what people usually have at hand: coordinates like "52.5163, 13.3777", or a link
// copied from OpenStreetMap, Google Maps or Apple Maps.
export function parseLocation(input: string): Location | null {
  const text = input.trim();
  const pair = text.match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (pair) {
    // "52,5163 13,3777" with decimal commas works too, as long as a space separates the numbers.
    const [lat, lon] = [pair[1]!, pair[2]!].map((part) => part.replace(",", "."));
    return location(lat, lon);
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const params = url.searchParams;
  // OpenStreetMap: ?mlat=..&mlon=.. marks the place, #map=zoom/lat/lon is the view.
  const view = url.hash.match(/map=(\d{1,2})\/(-?[\d.]+)\/(-?[\d.]+)/);
  if (params.has("mlat") && params.has("mlon")) return location(params.get("mlat")!, params.get("mlon")!, view?.[1]);
  if (view) return location(view[2], view[3], view[1]);
  // Google Maps: !3d..!4d.. is the place itself, @lat,lon,17z the view.
  const place = url.href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
  const at = url.pathname.match(/@(-?[\d.]+),(-?[\d.]+)(?:,([\d.]+)z)?/);
  if (place) return location(place[1], place[2], at?.[3]);
  if (at) return location(at[1], at[2], at[3]);
  // Apple Maps (ll=lat,lon) and search links with coordinates (q= or query=lat,lon).
  for (const key of ["ll", "q", "query"]) {
    const value = params.get(key)?.match(/^(-?[\d.]+),\s*(-?[\d.]+)$/);
    if (value) return location(value[1], value[2], params.get("z") ?? undefined);
  }
  return null;
}

// The map OpenStreetMap shows in a frame, with a marker on the place.
export function embedUrl({ lat, lon }: Location, zoom: number): string {
  // The visible area for a frame of about 800 × 450 pixels at this zoom level.
  const degreesPerPixel = 360 / (256 * 2 ** zoom);
  const halfWidth = 400 * degreesPerPixel;
  const halfHeight = 225 * degreesPerPixel * Math.cos((lat * Math.PI) / 180);
  const bbox = [lon - halfWidth, lat - halfHeight, lon + halfWidth, lat + halfHeight].map((value) => value.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

// The place on openstreetmap.org, for directions or a bigger map.
export const mapLink = ({ lat, lon }: Location, zoom: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const words = {
  de: { load: "Karte laden", note: "Beim Laden werden Daten an OpenStreetMap übertragen." },
  en: { load: "Load map", note: "Loading the map sends data to OpenStreetMap." },
};

// Shown inside the frame until a visitor clicks; the link then loads the real map in its place.
export function mapPlaceholder(place: Location, zoom: number, label: string, language: "de" | "en" = "de"): string {
  const text = words[language];
  return `<!doctype html><meta charset="utf-8"><style>
html,body{height:100%;margin:0}
a{box-sizing:border-box;height:100%;display:grid;place-content:center;justify-items:center;gap:10px;padding:16px;
background-color:#ecebe4;background-image:linear-gradient(115deg,transparent 46%,#fff 46%,#fff 49%,transparent 49%),
linear-gradient(25deg,transparent 60%,#fbfaf6 60%,#fbfaf6 62%,transparent 62%),linear-gradient(160deg,transparent 30%,#dfe8d6 30%,#dfe8d6 44%,transparent 44%);
color:#1d1b18;font:16px/1.4 system-ui,sans-serif;text-align:center;text-decoration:none}
svg{width:34px;height:34px;filter:drop-shadow(0 2px 2px #0003)}
span{max-width:28em;font-weight:600;text-shadow:0 0 6px #fff}
b{padding:9px 18px;border-radius:999px;background:#1d1b18;color:#fff}
a:hover b,a:focus-visible b{background:#000}
small{max-width:30em;padding:2px 8px;border-radius:6px;background:#fffc;color:#4a463f}
</style><a href="${escapeHtml(embedUrl(place, zoom))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#d63c2f" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>${
    label.trim() ? `<span>${escapeHtml(label.trim())}</span>` : ""
  }<b>${text.load}</b><small>${text.note}</small></a>`;
}
