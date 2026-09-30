import { AuthError, AuthStore } from "./auth";
import { openDatabase } from "./db";

// Maintenance commands, e.g.: bun run theta reset-password you@example.com

const [command, email] = Bun.argv.slice(2);

if (command === "reset-password" && email) {
  const auth = new AuthStore(openDatabase(process.env.THETA_DB ?? "theta.db"));
  const password = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url");
  try {
    await auth.setPassword(email, password);
    console.log(`Neues Passwort für ${email}: ${password}`);
    console.log("Alle bestehenden Anmeldungen dieses Kontos wurden beendet.");
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
} else {
  console.log("Verwendung: bun run theta reset-password <E-Mail>");
  process.exit(command ? 1 : 0);
}
