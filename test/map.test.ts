import { describe, expect, test } from "bun:test";
import { type Block, parseBlocks } from "../src/blocks";
import { exportSite } from "../src/export";
import { nominatim } from "../src/geocode";
import { pageBlocks } from "../src/templates";
import { embedUrl, mapLink, parseLocation } from "../src/theme/map";
import { testSite } from "./helpers";

const cafe: Block = { id: "karte", type: "map", lat: 52.497, lon: 13.4182, zoom: 17, label: "Lindenstraße 4, 10969 Berlin", width: "wide" };

describe("finding the place", () => {
  test("understands coordinates and links from map services", () => {
    expect(parseLocation("52.5163, 13.3777")).toEqual({ lat: 52.5163, lon: 13.3777 });
    expect(parseLocation("52,5163 13,3777")).toEqual({ lat: 52.5163, lon: 13.3777 });
    expect(parseLocation("https://www.openstreetmap.org/#map=17/52.51628/13.37771")).toEqual({ lat: 52.51628, lon: 13.37771, zoom: 17 });
    expect(parseLocation("https://www.openstreetmap.org/?mlat=52.5163&mlon=13.3777#map=15/52.51/13.37")).toEqual({ lat: 52.5163, lon: 13.3777, zoom: 15 });
    expect(parseLocation("https://www.google.com/maps/place/Brandenburger+Tor/@52.5162746,13.3755154,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d52.5162746!4d13.3777041")).toEqual({
      lat: 52.516275,
      lon: 13.377704,
      zoom: 17,
    });
    expect(parseLocation("https://www.google.com/maps/@48.1374,11.5755,15z")).toEqual({ lat: 48.1374, lon: 11.5755, zoom: 15 });
    expect(parseLocation("https://www.google.com/maps/search/?api=1&query=47.5596,7.5886")).toEqual({ lat: 47.5596, lon: 7.5886 });
    expect(parseLocation("https://maps.apple.com/?ll=50.1109,8.6821&z=16")).toEqual({ lat: 50.1109, lon: 8.6821, zoom: 16 });
    // Short links and addresses carry no coordinates; out-of-range numbers are no place.
    expect(parseLocation("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(parseLocation("Lindenstraße 4, Berlin")).toBeNull();
    expect(parseLocation("95, 13")).toBeNull();
    expect(parseLocation("52.5, 200")).toBeNull();
  });

  test("the frame shows the area around the marker; the link opens the same place", () => {
    const url = new URL(embedUrl({ lat: 52.497, lon: 13.4182 }, 17));
    expect(url.origin + url.pathname).toBe("https://www.openstreetmap.org/export/embed.html");
    expect(url.searchParams.get("marker")).toBe("52.497,13.4182");
    const [west, south, east, north] = url.searchParams.get("bbox")!.split(",").map(Number);
    expect(west! < 13.4182 && 13.4182 < east! && south! < 52.497 && 52.497 < north!).toBe(true);
    expect(east! - west!).toBeLessThan(0.01);
    expect(mapLink({ lat: 52.497, lon: 13.4182 }, 17)).toBe("https://www.openstreetmap.org/?mlat=52.497&mlon=13.4182#map=17/52.497/13.4182");
  });

  test("blocks keep only valid places and settings", () => {
    expect(parseBlocks([cafe])).toEqual([cafe]);
    expect(parseBlocks([{ ...cafe, lat: null, lon: null, zoom: 40, width: "riesig" }])).toEqual([{ ...cafe, lat: null, lon: null, zoom: 16, width: "normal" }]);
    expect(() => parseBlocks([{ ...cafe, lat: 120 }])).toThrow("gültige Koordinaten");
    expect(() => parseBlocks([{ ...cafe, lon: null }])).toThrow("gültige Koordinaten");
    expect(() => parseBlocks([{ ...cafe, lat: "52.5" }])).toThrow("gültige Koordinaten");
  });

  test("the contact page template puts a map right after the address", () => {
    expect(pageBlocks("contact", "Kontakt").map((block) => block.type)).toEqual(["heading", "text", "map", "heading", "hours", "heading", "form"]);
  });
});

describe("the map on the website", () => {
  test("waits for a click: nothing from OpenStreetMap loads with the page", async () => {
    const site = await testSite();
    const page = site.pages.create("Anfahrt");
    site.pages.save(page.slug, { blocks: [cafe, { ...cafe, id: "leer", lat: null, lon: null, label: "Noch offen" }] });
    site.pages.publish(page.slug, true);
    const html = await (await site.app.request(`/${page.slug}`)).text();
    expect(html).toContain('<figure class="t-map t-width-wide"><iframe title="Lindenstraße 4, 10969 Berlin" srcDoc="');
    expect(html).toContain("Karte laden");
    expect(html).toContain("Beim Laden werden Daten an OpenStreetMap übertragen.");
    expect(html).toContain('href="https://www.openstreetmap.org/?mlat=52.497&amp;mlon=13.4182#map=17/52.497/13.4182"');
    // The real map is only a link inside the placeholder, never a frame source or a script.
    expect(html).not.toMatch(/<iframe[^>]* src=/);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("Noch offen");

    site.settings.saveSite({ name: "Morning Café", language: "en" });
    const english = await (await site.app.request(`/${page.slug}`)).text();
    expect(english).toContain("Load map");
    expect(english).toContain("Open in OpenStreetMap");
  });

  test("works in the static export as well", async () => {
    const site = await testSite();
    site.pages.save("home", { blocks: [cafe] });
    site.pages.publish("home", true);
    const files = await exportSite(site, "https://cafe.test");
    expect(new TextDecoder().decode(files.get("index.html"))).toContain("Karte laden");
  });
});

describe("searching an address", () => {
  test("the editor asks through Theta, only when logged in", async () => {
    const site = await testSite({ login: true });
    expect((await site.app.request("/api/geocode?q=Lindenstra%C3%9Fe%204")).status).toBe(401);
    expect((await site.request("/api/geocode?q=ab")).status).toBe(400);
    const response = await site.request("/api/geocode?q=Lindenstra%C3%9Fe%204%2C%20Berlin");
    expect(await response.json()).toEqual([{ lat: 52.497, lon: 13.4182, name: "4, Lindenstraße, Kreuzberg, Berlin, 10969, Deutschland" }]);
    expect(site.places.queries).toEqual(["de:Lindenstraße 4, Berlin"]);

    site.places.control.fail = true;
    const errors = console.error;
    console.error = () => {};
    try {
      const failed = await site.request("/api/geocode?q=Irgendwo");
      expect(failed.status).toBe(502);
      expect(((await failed.json()) as { error: string }).error).toContain("Kartenlink einfügen");
    } finally {
      console.error = errors;
    }
  });

  test("Nominatim is asked politely: identified, once per second, and each search only once", async () => {
    const requests: { url: string; headers: Headers; at: number }[] = [];
    const fetcher = (async (url: URL, init: RequestInit) => {
      requests.push({ url: String(url), headers: new Headers(init.headers), at: Date.now() });
      return Response.json([{ lat: "52.4970", lon: "13.4182", display_name: "Lindenstraße 4, Berlin" }, { lat: "x", lon: "1", display_name: "kaputt" }]);
    }) as unknown as typeof fetch;
    const search = nominatim(fetcher);
    expect(await search("Lindenstraße 4", "de")).toEqual([{ lat: 52.497, lon: 13.4182, name: "Lindenstraße 4, Berlin" }]);
    await search("lindenstraße 4", "de");
    await search("Café Morgenrot", "de");
    expect(requests).toHaveLength(2);
    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "Lindenstraße 4", format: "jsonv2", limit: "5" });
    expect(requests[0]!.headers.get("user-agent")).toContain("Theta-CMS");
    expect(requests[0]!.headers.get("accept-language")).toBe("de");
    expect(requests[1]!.at - requests[0]!.at).toBeGreaterThanOrEqual(990);
  });
});
