import { runCommand } from "./commands";

// Maintenance commands, e.g.: bun run theta reset-password you@example.com

process.exit(await runCommand(Bun.argv.slice(2), "bun run theta"));
