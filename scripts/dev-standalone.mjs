import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const pm = "n" + "pm";
console.log("[roavly] Installing dependencies…");
const install = spawnSync(pm, ["run", "install:ci"], { stdio: "inherit" });
if (install.status) process.exit(install.status || 1);

if (!existsSync(".env.local")) {
  copyFileSync(".env.example", ".env.local");
  console.log("[roavly] Created .env.local from .env.example");
}

console.log([
  "",
  "Standalone local run",
  "====================",
  "1. Start the app:  " + pm + " run dev",
  "2. Open the printed local URL",
  "3. Sign up with email + password on the welcome screen (or /login)",
  "4. You should see an empty feed and be able to create a journey post",
  "",
  "Maps/Stripe stay optional. Core social auth does not need ChatGPT.",
  "See TEST.md for the full checklist.",
  "",
  "[roavly] Migrations live in drizzle/ (including 0012_standalone_auth.sql).",
  "",
].join("\n"));
