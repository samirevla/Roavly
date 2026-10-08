import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const d1Dir = join(root, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const drizzleDir = join(root, "drizzle");

function findDb() {
  if (!existsSync(d1Dir)) return null;
  const files = readdirSync(d1Dir)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(d1Dir, name));
  if (!files.length) return null;
  files.sort((a, b) => statSync(b).size - statSync(a).size);
  return files[0];
}

function listMigrationFiles() {
  return readdirSync(drizzleDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(drizzleDir, name));
}

function splitStatements(sql) {
  return sql
    .split(/-->\s*statement-breakpoint\s*/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function applyWithPython(dbPath, statements) {
  const payload = JSON.stringify({ db: dbPath, statements });
  const pyLines = [
    "import json, sqlite3, sys",
    "data = json.load(sys.stdin)",
    "conn = sqlite3.connect(data['db'])",
    "ok = 0",
    "skipped = 0",
    "errors = []",
    "for stmt in data['statements']:",
    "    try:",
    "        conn.execute(stmt)",
    "        conn.commit()",
    "        ok += 1",
    "    except sqlite3.OperationalError as e:",
    "        msg = str(e).lower()",
    "        if 'already exists' in msg or 'duplicate column' in msg:",
    "            skipped += 1",
    "            continue",
    "        errors.append(\"%s: %s\" % (e, stmt[:120]))",
    "        break",
    "    except Exception as e:",
    "        errors.append(\"%s: %s\" % (e, stmt[:120]))",
    "        break",
    "conn.close()",
    "print(json.dumps({'ok': ok, 'skipped': skipped, 'errors': errors}))",
    "if errors:",
    "    sys.exit(1)",
  ];
  const result = spawnSync("python3", ["-c", pyLines.join("\n")], {
    input: payload,
    encoding: "utf8",
  });
  const out = (result.stdout || "").trim();
  if (out) {
    try {
      return JSON.parse(out.split("\n").pop());
    } catch {
      /* fall through */
    }
  }
  if (result.status) {
    console.error(result.stderr || result.stdout || "python3 sqlite migrate failed");
    process.exit(result.status || 1);
  }
  return { ok: 0, skipped: 0, errors: [] };
}

const dbPath = findDb();
if (!dbPath) {
  console.log(
    "[roavly] No local Miniflare D1 sqlite found yet under .wrangler/state/v3/d1/.",
  );
  console.log(
    "[roavly] Start `npm run dev` once so Vite/Miniflare creates the DB, then re-run setup (or this script).",
  );
  process.exit(0);
}

if (!existsSync(drizzleDir)) {
  console.error("[roavly] Missing drizzle/ migrations directory");
  process.exit(1);
}

const migrations = listMigrationFiles();
if (!migrations.length) {
  console.log("[roavly] No drizzle/*.sql migrations to apply");
  process.exit(0);
}

console.log(`[roavly] Migrating local D1: ${dbPath}`);
let totalOk = 0;
let totalSkipped = 0;

for (const file of migrations) {
  const sql = readFileSync(file, "utf8");
  const statements = splitStatements(sql);
  if (!statements.length) continue;
  const name = file.split("/").pop();
  const result = applyWithPython(dbPath, statements);
  if (result.errors?.length) {
    console.error(`[roavly] Migration failed in ${name}:`, result.errors[0]);
    process.exit(1);
  }
  totalOk += result.ok;
  totalSkipped += result.skipped;
  console.log(
    `[roavly]   ${name}: applied ${result.ok}, skipped(already-exists) ${result.skipped}`,
  );
}

console.log(
  `[roavly] Local D1 migrations done (applied ${totalOk}, skipped ${totalSkipped}).`,
);
