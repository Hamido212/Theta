import { fileURLToPath } from "node:url";

// Files Theta serves itself: stylesheets, fonts, built-in images and the editor script.
// Paths are relative to the project folder, e.g. "src/theme/theme.css". The single-file
// build (scripts/build.ts) embeds them in the program and registers them before the server
// starts; otherwise they are read from the project folder.

const ROOT = fileURLToPath(new URL("..", import.meta.url));

declare global {
  var thetaAssets: Map<string, string> | undefined;
}

export function assetPath(path: string): string {
  return globalThis.thetaAssets?.get(path) ?? ROOT + path;
}

export const assetFile = (path: string) => Bun.file(assetPath(path));

// True inside the single-file program.
export const isCompiled = () => globalThis.thetaAssets !== undefined;
