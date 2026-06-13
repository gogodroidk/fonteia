import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const scriptName = process.argv[2];

if (!scriptName) {
  console.error("Usage: node scripts/run-workspaces.mjs <script>");
  process.exit(1);
}

const workspaceDirs = [
  "packages/domain",
  "packages/sources",
  "packages/config",
  "packages/ui",
  "packages/ai",
  "packages/scoring",
  "packages/compliance",
  "services/ingest",
  "services/search-indexer",
  "services/alerting",
  "services/billing",
  "services/api",
  "apps/api",
  "apps/web",
  "apps/mobile",
];

let failed = false;

for (const dir of workspaceDirs) {
  const manifestPath = join(process.cwd(), dir, "package.json");

  if (!existsSync(manifestPath)) {
    continue;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const command = manifest.scripts?.[scriptName];

  if (!command) {
    continue;
  }

  console.log(`\n> ${manifest.name} ${scriptName}`);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", scriptName], {
    cwd: join(process.cwd(), dir),
    stdio: "inherit",
    shell: true,
  });

  if (result.error) {
    console.error(result.error.message);
  }

  if (result.status !== 0) {
    failed = true;
    break;
  }
}

process.exit(failed ? 1 : 0);
