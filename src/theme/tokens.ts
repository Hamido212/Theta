import { ValidationError } from "../blocks";

// Themes are sets of design tokens. A site picks a preset and may adjust a few choices;
// everything is turned into CSS custom properties, so no block ever carries its own style.

type Palette = { bg: string; text: string; muted: string };

// Only fonts already on the visitor's device: nothing is downloaded from font services.
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const CLASSIC = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const ROUNDED = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';

export const FONTS = {
  "serif-headings": { label: "Serifen-Überschriften", heading: 'ui-serif, Georgia, "Times New Roman", serif', body: SANS },
  system: { label: "Modern und schlicht", heading: SANS, body: SANS },
  classic: { label: "Klassisch", heading: CLASSIC, body: CLASSIC },
  rounded: { label: "Rund und freundlich", heading: ROUNDED, body: ROUNDED },
  "mono-headings": { label: "Technisch", heading: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace', body: SANS },
} as const;

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
  const light = colors(preset.light, theme.accent);
  const dark = colors(preset.dark, darkAccent(theme.accent, preset.dark.bg));
  const root = (vars: string[]) => `:root{${vars.join(";")}}`;

  if (theme.colorScheme === "light") return root([...shared, ...light, "color-scheme: light"]);
  if (theme.colorScheme === "dark") return root([...shared, ...dark, "color-scheme: dark"]);
  return `${root([...shared, ...light, "color-scheme: light dark"])}@media (prefers-color-scheme: dark){${root(dark)}}`;
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
