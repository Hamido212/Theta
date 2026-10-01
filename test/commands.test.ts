import { type Mock, afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStore } from "../src/auth";
import { commands, runCommand } from "../src/commands";
import { openDatabase } from "../src/db";

// The maintenance commands of `bun run theta` and of the program (./theta reset-password …).

const dir = mkdtempSync(join(tmpdir(), "theta-commands-"));
const db = join(dir, "theta.db");
const previous = process.env.THETA_DB;
const output: string[] = [];
let log: Mock<typeof console.log>;
let error: Mock<typeof console.error>;

beforeAll(async () => {
  log = spyOn(console, "log").mockImplementation((...args) => void output.push(args.join(" ")));
  error = spyOn(console, "error").mockImplementation((...args) => void output.push(args.join(" ")));
  process.env.THETA_DB = db;
  await new AuthStore(openDatabase(db)).createUser({ email: "erika@example.com", name: "Erika", password: "altes-passwort-123" });
});
afterEach(() => void (output.length = 0));
afterAll(() => {
  log.mockRestore();
  error.mockRestore();
  if (previous === undefined) delete process.env.THETA_DB;
  else process.env.THETA_DB = previous;
  rmSync(dir, { recursive: true, force: true });
});

describe("maintenance commands", () => {
  test("reset-password sets a new random password for the site's account", async () => {
    expect(await runCommand(["reset-password", "erika@example.com"], "./theta")).toBe(0);
    const password = output.join("\n").match(/Neues Passwort für erika@example\.com: (\S+)/)?.[1];
    expect(password).toBeDefined();
    const auth = new AuthStore(openDatabase(db));
    expect(await auth.verify("erika@example.com", "altes-passwort-123")).toBeNull();
    expect(await auth.verify("erika@example.com", password!)).not.toBeNull();
  });

  test("a reset while Theta runs lifts the lock after too many failed logins", async () => {
    const server = new AuthStore(openDatabase(db));
    for (let i = 0; i < 10; i++) expect(await server.verify("erika@example.com", "falsch-falsch")).toBeNull();
    await expect(server.verify("erika@example.com", "falsch-falsch")).rejects.toThrow("Zu viele Fehlversuche");
    expect(await runCommand(["reset-password", "erika@example.com"], "./theta")).toBe(0);
    const password = output.join("\n").match(/: (\S+)$/m)?.[1];
    expect(await server.verify("erika@example.com", password!)).toMatchObject({ email: "erika@example.com" });
  });

  test("an unknown address fails with a message", async () => {
    expect(await runCommand(["reset-password", "niemand@example.com"], "./theta")).toBe(1);
    expect(output.join("\n")).toContain("niemand@example.com");
  });

  test("backup writes a ZIP next to the given name", async () => {
    const file = join(dir, "sicherung.zip");
    expect(await runCommand(["backup", file], "./theta")).toBe(0);
    expect(existsSync(file)).toBe(true);
  });

  test("restore asks for confirmation with the caller's own command", async () => {
    expect(await runCommand(["restore", join(dir, "sicherung.zip")], "theta.exe")).toBe(1);
    expect(output.join("\n")).toContain(`theta.exe restore ${join(dir, "sicherung.zip")} --ja`);
  });

  test("a missing backup file or a wrong address gets a plain message", async () => {
    expect(await runCommand(["restore", join(dir, "gibt-es-nicht.zip"), "--ja"], "./theta")).toBe(1);
    expect(output.join("\n")).toContain("gibt-es-nicht.zip gibt es nicht");
    expect(await runCommand(["export", join(dir, "export"), "meine-seite"], "./theta")).toBe(1);
    expect(output.join("\n")).toContain("Bitte die Adresse der Website angeben");
  });

  test("help lists every command for the caller, a wrong call fails", async () => {
    expect(await runCommand(["hilfe"], "./theta")).toBe(0);
    expect(output.join("\n")).toContain("./theta reset-password <E-Mail>");
    expect(await runCommand(["reset-password"], "./theta")).toBe(1);
    expect(await runCommand([], "bun run theta")).toBe(0);
  });

  test("the program only treats known words as commands", () => {
    // Anything else (for example an argument a launcher adds) still starts the website.
    for (const word of ["reset-password", "export", "backup", "restore", "hilfe", "--help"]) expect(commands).toContain(word);
    expect(commands).not.toContain("-psn_0_12345");
  });
});
