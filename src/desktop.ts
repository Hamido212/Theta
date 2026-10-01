import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { commands, runCommand } from "./commands";
import { startServer } from "./server";

// The single-file program (scripts/build.ts). Its data lives in the folder "theta-daten" next
// to the program, it finds a free port and opens the browser, so nobody needs a terminal.

process.env.THETA_DB ??= join(dirname(process.execPath), "theta-daten", "theta.db");
mkdirSync(dirname(process.env.THETA_DB), { recursive: true });

// Started from a terminal with a maintenance command, e.g. ./theta reset-password you@example.com:
// run it on the same data instead of the website. Anything else starts Theta as usual.
const args = process.argv.slice(2);
if (args[0] && commands.includes(args[0])) {
  process.exit(await runCommand(args, process.platform === "win32" ? "theta.exe" : "./theta"));
}

let url: URL | undefined;
const fixedPort = process.env.PORT !== undefined;
for (let port = 3000; !url; port++) {
  if (!fixedPort) process.env.PORT = String(port);
  try {
    url = startServer();
  } catch (err) {
    if (fixedPort || port >= 3020 || (err as { code?: string }).code !== "EADDRINUSE") throw err;
  }
}

console.log(`Deine Daten liegen in ${dirname(process.env.THETA_DB)}.`);
console.log("Lass dieses Fenster offen, solange du an deiner Website arbeitest. Wenn du es schließt, endet Theta.");

if (process.env.THETA_OPEN !== "0") {
  const command =
    process.platform === "darwin" ? ["open", url.href]
    : process.platform === "win32" ? ["cmd", "/c", "start", "", url.href]
    : ["xdg-open", url.href];
  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // No browser to open, e.g. on a server. The address is printed above.
  }
}
