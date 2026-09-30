import { ValidationError } from "../blocks";

// Themes are sets of design tokens. A site picks a preset and may adjust a few choices;
// everything is turned into CSS custom properties, so no block ever carries its own style.

type Palette = { bg: string; text: string; muted: string };

// System fonts are already on the visitor's device. The bundled fonts (SIL Open Font License,
// in ./fonts) are served by the site itself: nothing is ever loaded from font services, and
// a visitor only downloads the fonts the chosen theme uses.
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF = 'ui-serif, Georgia, "Times New Roman", serif';
const CLASSIC = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const ROUNDED = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';

export const WEB_FONTS = {
  inter: { family: "Inter", weight: "100 900" },
  fraunces: { family: "Fraunces", weight: "100 900" },
  lora: { family: "Lora", weight: "400 700" },
  "space-grotesk": { family: "Space Grotesk", weight: "300 700" },
} as const;
export type WebFont = keyof typeof WEB_FONTS;

// Each font is split like the fonts themselves: basic Latin (enough for German and English)
// and extended Latin, which browsers only fetch when a page uses such letters.
const SUBSETS = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
};

type FontChoice = { label: string; heading: string; body: string; web: readonly WebFont[] };

const stack = (font: WebFont, fallback: string) => `"${WEB_FONTS[font].family}", ${fallback}`;

export const FONTS = {
  "serif-headings": { label: "Serifen-Überschriften", heading: SERIF, body: SANS, web: [] },
  system: { label: "Modern und schlicht", heading: SANS, body: SANS, web: [] },
  classic: { label: "Klassisch", heading: CLASSIC, body: CLASSIC, web: [] },
  rounded: { label: "Rund und freundlich", heading: ROUNDED, body: ROUNDED, web: [] },
  "mono-headings": { label: "Technisch", heading: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace', body: SANS, web: [] },
  inter: { label: "Inter: modern", heading: stack("inter", SANS), body: stack("inter", SANS), web: ["inter"] },
  elegant: { label: "Fraunces und Inter: elegant", heading: stack("fraunces", SERIF), body: stack("inter", SANS), web: ["fraunces", "inter"] },
  book: { label: "Lora: warm, gut lesbar", heading: stack("lora", CLASSIC), body: stack("lora", CLASSIC), web: ["lora"] },
  grotesk: { label: "Space Grotesk und Inter: markant", heading: stack("space-grotesk", SANS), body: stack("inter", SANS), web: ["space-grotesk", "inter"] },
} satisfies Record<string, FontChoice>;

// File names of a bundled font, relative to /assets/fonts/.
export const fontFiles = (font: WebFont) => (Object.keys(SUBSETS) as (keyof typeof SUBSETS)[]).map((subset) => `${font}-${subset}.woff2`);

export const isFontFile = (name: string) => (Object.keys(WEB_FONTS) as WebFont[]).some((font) => fontFiles(font).includes(name));

// The @font-face rules for the bundled fonts a theme uses.
export function fontFaces(fonts: readonly WebFont[]): string {
  return fonts
    .flatMap((font) =>
      (Object.entries(SUBSETS) as [keyof typeof SUBSETS, string][]).map(
        ([subset, range]) =>
          `@font-face{font-family:"${WEB_FONTS[font].family}";font-style:normal;font-display:swap;font-weight:${WEB_FONTS[font].weight};src:url(/assets/fonts/${font}-${subset}.woff2) format("woff2");unicode-range:${range}}`,
      ),
    )
    .join("");
}

export const SPACING = { compact: { label: "Kompakt", value: "1.1rem" }, normal: { label: "Normal", value: "1.5rem" }, airy: { label: "Luftig", value: "2.1rem" } } as const;
export const RADIUS = {
  square: { label: "Eckig", value: "3px", button: "4px" },
  soft: { label: "Leicht abgerundet", value: "12px", button: "999px" },
  round: { label: "Rund", value: "24px", button: "999px" },
} as const;
export const WIDTH = { narrow: { label: "Schmal", value: "36rem" }, normal: { label: "Normal", value: "42rem" }, wide: { label: "Breit", value: "54rem" } } as const;
export const SCHEMES = { auto: "Wie am Gerät eingestellt", light: "Immer hell", dark: "Immer dunkel" } as const;

export type ThemeSettings = {
  preset: PresetId;
  accent: string;
  fonts: keyof typeof FONTS;
  spacing: keyof typeof SPACING;
  radius: keyof typeof RADIUS;
  width: keyof typeof WIDTH;
  colorScheme: keyof typeof SCHEMES;
};

type Preset = {
  label: string;
  description: string;
  light: Palette;
  dark: Palette;
  defaults: Omit<ThemeSettings, "preset">;
};

export const PRESETS = {
  klar: {
    label: "Klar",
    description: "Ruhig und hell, mit Serifen-Überschriften. Passt zu fast allem.",
    light: { bg: "#fbfaf7", text: "#1d1b18", muted: "#6b665e" },
    dark: { bg: "#16151a", text: "#ecebe8", muted: "#a19c93" },
    defaults: { accent: "#4f46e5", fonts: "serif-headings", spacing: "normal", radius: "soft", width: "normal", colorScheme: "auto" },
  },
  modern: {
    label: "Modern",
    description: "Kühl und sachlich, klare Kanten. Gut für Firmen und Projekte.",
    light: { bg: "#ffffff", text: "#0f172a", muted: "#64748b" },
    dark: { bg: "#0b1120", text: "#e2e8f0", muted: "#94a3b8" },
    defaults: { accent: "#2563eb", fonts: "system", spacing: "normal", radius: "square", width: "wide", colorScheme: "auto" },
  },
  warm: {
    label: "Warm",
    description: "Erdige Töne, klassische Schrift, viel Luft. Gut für Cafés, Handwerk und Persönliches.",
    light: { bg: "#fdf6ec", text: "#2b2118", muted: "#7a6a58" },
    dark: { bg: "#1f1812", text: "#f3e9dc", muted: "#b3a390" },
    defaults: { accent: "#c2410c", fonts: "classic", spacing: "airy", radius: "round", width: "narrow", colorScheme: "auto" },
  },
  studio: {
    label: "Studio",
    description: "Markante Überschriften, viel Weißraum, kräftige Farbe. Gut für Agenturen, Kreative und Portfolios.",
    light: { bg: "#f7f7f4", text: "#111111", muted: "#5c5c57" },
    dark: { bg: "#111111", text: "#f2f2ee", muted: "#a3a39c" },
    defaults: { accent: "#6d28d9", fonts: "grotesk", spacing: "airy", radius: "soft", width: "wide", colorScheme: "auto" },
  },
} satisfies Record<string, Preset>;

export type PresetId = keyof typeof PRESETS;

export const defaultTheme = (preset: PresetId = "klar"): ThemeSettings => ({ preset, ...PRESETS[preset].defaults });

export function parseTheme(input: Record<string, unknown>): ThemeSettings {
  const preset = oneOf(input.preset, PRESETS, "Vorlage");
  const accent = String(input.accent ?? "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(accent)) throw new ValidationError("Die Akzentfarbe muss eine Farbe wie #4f46e5 sein");
  return {
    preset,
    accent,
    fonts: oneOf(input.fonts, FONTS, "Schrift"),
    spacing: oneOf(input.spacing, SPACING, "Abstände"),
    radius: oneOf(input.radius, RADIUS, "Ecken"),
    width: oneOf(input.width, WIDTH, "Breite"),
    colorScheme: oneOf(input.colorScheme, SCHEMES, "Hell/Dunkel"),
  };
}

function oneOf<T extends object>(value: unknown, options: T, field: string): keyof T & string {
  if (typeof value === "string" && Object.hasOwn(options, value)) return value as keyof T & string;
  throw new ValidationError(`Ungültige Auswahl bei ${field}`);
}

// The CSS custom properties for a theme, ready for a <style> tag.
export function themeCss(theme: ThemeSettings): string {
  const preset = PRESETS[theme.preset];
  const fonts = FONTS[theme.fonts];
  const shared = [
    `--t-font-body: ${fonts.body}`,
    `--t-font-heading: ${fonts.heading}`,
    `--t-space: ${SPACING[theme.spacing].value}`,
    `--t-measure: ${WIDTH[theme.width].value}`,
    `--t-radius: ${RADIUS[theme.radius].value}`,
    `--t-radius-button: ${RADIUS[theme.radius].button}`,
  ];
  const lightAccent = theme.accent;
  const nightAccent = darkAccent(theme.accent, preset.dark.bg);
  const light = colors(preset.light, lightAccent);
  const dark = colors(preset.dark, nightAccent);
  const root = (vars: string[]) => `:root{${vars.join(";")}}`;
  // Section bands redefine the colours, so every block inside adapts on its own.
  const bands = (palette: Palette, accent: string, other: Palette, otherAccent: string) =>
    [
      `.t-band-soft{${colors({ ...palette, bg: mix(palette.bg, palette.text, 0.05) }, accent).join(";")}}`,
      `.t-band-accent{${colors({ bg: accent, text: readableOn(accent), muted: readableOn(accent) }, readableOn(accent)).join(";")}}`,
      `.t-band-inverse{${colors(other, otherAccent).join(";")}}`,
    ].join("");
  const lightBands = bands(preset.light, lightAccent, preset.dark, nightAccent);
  const darkBands = bands(preset.dark, nightAccent, preset.light, lightAccent);

  const faces = fontFaces(fonts.web);

  if (theme.colorScheme === "light") return faces + root([...shared, ...light, "color-scheme: light"]) + lightBands;
  if (theme.colorScheme === "dark") return faces + root([...shared, ...dark, "color-scheme: dark"]) + darkBands;
  return `${faces}${root([...shared, ...light, "color-scheme: light dark"])}${lightBands}@media (prefers-color-scheme: dark){${root(dark)}${darkBands}}`;
}

function colors(palette: Palette, accent: string): string[] {
  return [
    `--t-color-bg: ${palette.bg}`,
    `--t-color-text: ${palette.text}`,
    `--t-color-muted: ${palette.muted}`,
    `--t-color-accent: ${accent}`,
    `--t-color-on-accent: ${readableOn(accent)}`,
  ];
}

// Guardrails: warnings shown before a colour makes the site hard to read.
export function accentWarnings(theme: ThemeSettings): string[] {
  const preset = PRESETS[theme.preset];
  const warnings: string[] = [];
  if (contrast(theme.accent, preset.light.bg) < 3) {
    warnings.push("Die Akzentfarbe ist auf dem hellen Hintergrund schwer zu erkennen. Eine dunklere Farbe wäre besser lesbar.");
  }
  return warnings;
}

// On dark backgrounds, lighten the accent until it stands out enough.
export function darkAccent(accent: string, background: string): string {
  let color = accent;
  for (let step = 1; step <= 6 && contrast(color, background) < 4.5; step++) color = mix(accent, "#ffffff", step * 0.12);
  return color;
}

export function readableOn(color: string): string {
  return contrast(color, "#ffffff") >= contrast(color, "#111111") ? "#ffffff" : "#111111";
}

// WCAG contrast ratio between two #rrggbb colours (1 to 21).
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(a: string, b: string, amount: number): string {
  const [ca, cb] = [rgb(a), rgb(b)];
  return `#${ca.map((channel, i) => Math.round(channel + (cb[i]! - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
