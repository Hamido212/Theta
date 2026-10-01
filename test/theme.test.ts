import { describe, expect, test } from "bun:test";
import { ValidationError } from "../src/blocks";
import { accentWarnings, contrast, darkAccent, defaultTheme, parseTheme, readableOn, themeCss } from "../src/theme/tokens";
import { exportSite } from "../src/export";
import { form, testSite } from "./helpers";

describe("tokens", () => {
  test("each preset produces light and dark tokens", () => {
    for (const preset of ["klar", "modern", "warm", "studio", "portfolio"] as const) {
      const css = themeCss(defaultTheme(preset));
      expect(css).toContain("--t-color-accent:");
      expect(css).toContain("--t-font-heading:");
      expect(css).toContain("@media (prefers-color-scheme: dark)");
    }
  });

  test("bundled fonts are declared only when the theme uses them", () => {
    expect(themeCss(defaultTheme("klar"))).not.toContain("@font-face");
    const css = themeCss({ ...defaultTheme("klar"), fonts: "elegant" });
    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect(css).toContain("url(/assets/fonts/fraunces-latin.woff2)");
    expect(css).toContain('--t-font-heading: "Fraunces", ui-serif');
    expect(css).toContain('--t-font-body: "Inter", ui-sans-serif');
    expect(css).not.toContain("fonts.googleapis");
  });

  test("a fixed colour scheme uses only that palette", () => {
    const light = themeCss({ ...defaultTheme("klar"), colorScheme: "light" });
    expect(light).not.toContain("@media");
    expect(light).toContain("--t-color-bg: #fbfaf7");
    const dark = themeCss({ ...defaultTheme("klar"), colorScheme: "dark" });
    expect(dark).toContain("--t-color-bg: #16151a");
  });

  test("section bands get their own colours: tinted, accent and the opposite palette", () => {
    const css = themeCss({ ...defaultTheme("klar"), colorScheme: "light" });
    expect(css).toContain(".t-band-soft{");
    expect(css).toContain(".t-band-accent{--t-color-bg: #4f46e5;--t-color-text: #ffffff");
    expect(css).toMatch(/\.t-band-inverse\{--t-color-bg: #16151a/);
    const auto = themeCss(defaultTheme("klar"));
    expect(auto.split("@media")[1]).toMatch(/\.t-band-inverse\{--t-color-bg: #fbfaf7/);
  });

  test("button text colour follows the accent", () => {
    expect(readableOn("#4f46e5")).toBe("#ffffff");
    expect(readableOn("#facc15")).toBe("#111111");
  });

  test("the accent is lightened on dark backgrounds until it is readable", () => {
    const accent = darkAccent("#4f46e5", "#16151a");
    expect(accent).not.toBe("#4f46e5");
    expect(contrast(accent, "#16151a")).toBeGreaterThanOrEqual(4.5);
    expect(darkAccent("#fbbf24", "#16151a")).toBe("#fbbf24");
  });

  test("hard to read accents produce a warning", () => {
    expect(accentWarnings({ ...defaultTheme(), accent: "#fde68a" })).toHaveLength(1);
    expect(accentWarnings(defaultTheme())).toHaveLength(0);
  });

  test.each([
    ["an accent that is not a colour", { accent: "red;}body{display:none" }],
    ["an unknown preset", { preset: "neon" }],
    ["an unknown font", { fonts: "Comic Sans" }],
    ["an inherited property name", { spacing: "toString" }],
  ])("rejects %s", (_, patch) => {
    expect(() => parseTheme({ ...defaultTheme(), ...patch })).toThrow(ValidationError);
  });
});

describe("design page", () => {
  test("needs a login", async () => {
    const { request, auth } = await testSite();
    await auth.createUser({ email: "a@example.com", name: "A", password: "richtig-geheim" });
    expect((await request("/admin/design")).status).toBe(302);
  });

  test("saving changes the tokens on public pages and in the editor", async () => {
    const { request, settings } = await testSite({ login: true });
    expect(await (await request("/")).text()).toContain("--t-color-accent: #4f46e5");

    const res = await request("/admin/design", form({ ...defaultTheme(), accent: "#0F766E", spacing: "airy", colorScheme: "light" }));
    expect(res.status).toBe(302);
    expect(settings.theme()).toMatchObject({ accent: "#0f766e", spacing: "airy", colorScheme: "light" });

    for (const path of ["/", "/edit", "/gibt-es-nicht"]) {
      const html = await (await request(path)).text();
      expect(html).toContain("--t-color-accent: #0f766e");
      expect(html).toContain("--t-space: 2.1rem");
    }
  });

  test("choosing a preset starts from its defaults", async () => {
    const { request, settings } = await testSite({ login: true });
    settings.saveTheme({ ...defaultTheme(), accent: "#000000" });
    await request("/admin/design/preset", form({ preset: "warm" }));
    expect(settings.theme()).toEqual(defaultTheme("warm"));
  });

  test("invalid input is explained and nothing changes", async () => {
    const { request, settings } = await testSite({ login: true });
    const res = await request("/admin/design", form({ ...defaultTheme(), accent: "blau" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Akzentfarbe");
    expect(settings.theme()).toEqual(defaultTheme());
  });
});

describe("bundled fonts", () => {
  test("are served from the site itself, other names are not", async () => {
    const { request } = await testSite();
    const font = await request("/assets/fonts/inter-latin.woff2");
    expect(font.status).toBe(200);
    expect(font.headers.get("content-type")).toBe("font/woff2");
    expect((await font.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
    const atkinson = await request("/assets/fonts/atkinson-regular.woff");
    expect(atkinson.status).toBe(200);
    expect(atkinson.headers.get("content-type")).toBe("font/woff");
    expect((await atkinson.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
    expect((await request("/assets/fonts/atkinson-LICENSE.txt")).status).toBe(404);
    expect((await request("/assets/fonts/inter-LICENSE.txt")).status).toBe(404);
    expect((await request("/assets/fonts/..%2F..%2Fserver.ts")).status).toBe(404);
  });

  test("the static export contains exactly the fonts in use", async () => {
    const site = await testSite();
    const without = await exportSite(site, "https://example.com");
    expect([...without.keys()].filter((name) => name.startsWith("assets/fonts/"))).toEqual([]);
    site.settings.saveTheme({ ...defaultTheme("studio") });
    const files = await exportSite(site, "https://example.com");
    expect([...files.keys()].filter((name) => name.startsWith("assets/fonts/")).sort()).toEqual([
      "assets/fonts/inter-latin-ext.woff2",
      "assets/fonts/inter-latin.woff2",
      "assets/fonts/space-grotesk-latin-ext.woff2",
      "assets/fonts/space-grotesk-latin.woff2",
    ]);
  });
});
