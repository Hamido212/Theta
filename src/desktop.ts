import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { startServer } from "./server";

// The single-file program (scripts/build.ts). Its data lives in the folder "theta-daten" next
// to the program, it finds a free port and opens the browser, so nobody needs a terminal.

process.env.THETA_DB ??= join(dirname(process.execPath), "theta-daten", "theta.db");
mkdirSync(dirname(process.env.THETA_DB), { recursive: true });

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
