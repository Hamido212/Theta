import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

// Builds Theta as a program that runs without Bun or a terminal:
//   bun run build                    → dist/theta/ for this computer
//   bun run build bun-windows-x64    → another system (sharp must then be added by hand)
// The folder holds the program, the image library sharp (a native library that cannot be
// embedded) and a short guide. Everything else, including the editor, is inside the program.

const root = join(import.meta.dir, "..");
const target = Bun.argv[2];
const build = join(root, "build");
const out = join(root, "dist", "theta");
rmSync(build, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(build, { recursive: true });
mkdirSync(out, { recursive: true });

// 1. The browser editor, built once in advance (the server builds it on demand otherwise).
const editor = await Bun.build({
  entrypoints: [join(root, "src", "editor", "main.tsx")],
  target: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!editor.success) throw new AggregateError(editor.logs, "Editor konnte nicht gebaut werden");
await Bun.write(join(build, "editor.js"), editor.outputs[0]!);

// 2. Every file Theta serves, embedded in the program and registered for src/assets.ts.
const files = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const assets = [
  "src/theme/theme.css",
  "src/admin/admin.css",
  "src/editor/editor.css",
  ...files("src/theme/fonts"),
  ...files("media"),
  "build/editor.js",
].map((path) => path.split("\\").join("/"));
writeFileSync(
  join(build, "embedded.ts"),
  assets.map((path, i) => `import a${i} from ${JSON.stringify(`../${path}`)} with { type: "file" };`).join("\n") +
    `\nglobalThis.thetaAssets = new Map([${assets.map((path, i) => `[${JSON.stringify(path)}, a${i}]`).join(", ")}]);\n`,
);
// The assets must be registered before any Theta module loads, so they come first.
writeFileSync(join(build, "main.ts"), `import "./embedded";\nimport "../src/desktop";\n`);

// 3. The program itself.
const name = (target ? target.includes("windows") : process.platform === "win32") ? "theta.exe" : "theta";
const compile = Bun.spawnSync(
  ["bun", "build", "--compile", "--minify", ...(target ? [`--target=${target}`] : []), "--external", "sharp", join(build, "main.ts"), "--outfile", join(out, name)],
  { stdout: "inherit", stderr: "inherit", cwd: root },
);
if (compile.exitCode !== 0) process.exit(compile.exitCode ?? 1);

// 4. sharp. A compiled program cannot look up packages in node_modules, so sharp's JavaScript
// is bundled into one file, and only its native library for this system is copied as is
// (the library finds libvips through paths relative to its own folder).
// Other systems are built on their own computers, see .github/workflows/release.yml.
if (!target) {
  const system = `${process.platform}-${process.arch}`;
  const modules = join(root, "node_modules");
  const native = [`sharp-${system}`, `sharp-libvips-${system}`];
  for (const name of native) {
    if (existsSync(join(modules, "@img", name))) cpSync(join(modules, "@img", name), join(out, "node_modules", "@img", name), { recursive: true, dereference: true });
  }
  const sharp = await Bun.build({
    entrypoints: [join(modules, "sharp", "dist", "index.cjs")],
    target: "bun",
    format: "cjs",
    external: ["@img/sharp-*"],
  });
  if (!sharp.success) throw new AggregateError(sharp.logs, "sharp konnte nicht gebündelt werden");
  // sharp asks for its native library by package name; point it at the copied folder instead.
  const code = await sharp.outputs[0]!.text();
  const request = `require("@img/sharp-${system}/sharp.node")`;
  if (!code.includes(request)) throw new Error(`sharp lädt seine native Bibliothek nicht mehr über ${request}`);
  await Bun.write(join(out, "node_modules", "sharp.cjs"), code.replace(request, `require("./@img/sharp-${system}/index.cjs")`));
  cpSync(join(modules, "sharp", "LICENSE"), join(out, "node_modules", "sharp-LICENSE.txt"));
}

cpSync(join(root, "LICENSE"), join(out, "LICENSE.txt"));
writeFileSync(
  join(out, "LIESMICH.txt"),
  `Theta
=====

Starten: Doppelklick auf "${name}". Der Browser öffnet sich mit der Einrichtung.
Ein Fenster zeigt, dass Theta läuft. Lass es offen, solange du an deiner Website arbeitest.

Deine Daten liegen im Ordner "theta-daten" neben dem Programm. Unter "Übersicht" in der
Verwaltung lädst du jederzeit eine Sicherung herunter, mit der du auf einen anderen Rechner
umziehen kannst.

Den Ordner "node_modules" braucht Theta für Bilder. Bitte nicht löschen.
Theta steht unter der MIT-Lizenz, siehe LICENSE.txt.

macOS: Beim ersten Start mit Rechtsklick auf "theta" und "Öffnen" bestätigen.
Windows: Erscheint ein Hinweis von SmartScreen, auf "Weitere Informationen" und "Trotzdem ausführen" klicken.
`,
);
console.log(`Fertig: ${relative(root, out)}`);
