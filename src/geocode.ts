// Finds places for the map block by address, using OpenStreetMap's search (Nominatim).
// Only the editor uses it, when a site owner searches; visitors never trigger a request.
// Nominatim asks for at most one request per second and an identifying User-Agent.

export type Place = { lat: number; lon: number; name: string };

export type Geocoder = (query: string, language: "de" | "en") => Promise<Place[]>;

const USER_AGENT = "Theta-CMS (+https://github.com/Hamido212/Theta)";

export function nominatim(fetcher: typeof fetch = fetch): Geocoder {
  let last = 0;
  const cache = new Map<string, Place[]>();
  return async (query, language) => {
    const key = `${language}:${query.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const wait = last + 1_000 - Date.now();
    last = Date.now() + Math.max(wait, 0);
    if (wait > 0) await Bun.sleep(wait);
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "5" }).toString();
    const response = await fetcher(url, {
      headers: { "user-agent": USER_AGENT, "accept-language": language },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`OpenStreetMap antwortet mit Status ${response.status}`);
    const data: unknown = await response.json();
    const places = (Array.isArray(data) ? data : []).flatMap((item: Record<string, unknown>) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      const name = typeof item.display_name === "string" ? item.display_name : "";
      return Number.isFinite(lat) && Number.isFinite(lon) && name ? [{ lat, lon, name }] : [];
    });
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, places);
    return places;
  };
}
