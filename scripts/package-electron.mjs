import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipBuild = args.has("--skip-build");

const root = process.cwd();
const platform = process.env.ELECTRON_PLATFORM || (process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux");
const arch = process.env.ELECTRON_ARCH || "x64";
const appName = process.env.ELECTRON_APP_NAME || "UltraOffice";
const outputDir = process.env.ELECTRON_OUT_DIR || "electron-release";

function run(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`\n> ${printable}`);
  if (dryRun) return;

  const result = process.platform === "win32" && ["npm", "npx"].includes(command)
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", quoteWindowsCommand([command, ...commandArgs])], {
        cwd: root,
        stdio: "inherit",
        ...options,
      })
    : spawnSync(command, commandArgs, {
        cwd: root,
        stdio: "inherit",
        ...options,
      });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function quoteWindowsCommand(parts) {
  return parts.map((part) => {
    const value = String(part);
    if (!/[\s&()^|<>"]/.test(value)) return value;
    return `"${value.replace(/"/g, '\\"')}"`;
  }).join(" ");
}

if (!skipBuild) {
  run("npm", ["run", "build"]);
}

if (!dryRun && existsSync(join(root, outputDir))) {
  rmSync(join(root, outputDir), { recursive: true, force: true });
}

run("npx", [
  "electron-packager",
  ".",
  appName,
  "--platform",
  platform,
  "--arch",
  arch,
  "--out",
  outputDir,
  "--overwrite",
  "--prune=true",
  "--ignore=^/\\.git($|/)",
  "--ignore=^/\\.github($|/)",
  "--ignore=^/\\.env",
  "--ignore=^/android($|/)",
  "--ignore=^/ios($|/)",
  "--ignore=^/docs($|/)",
  "--ignore=^/exports($|/)",
  "--ignore=^/electron-release($|/)",
  "--ignore=^/electron-release-new($|/)",
  "--ignore=^/coverage($|/)",
  "--ignore=^/supabase/.temp($|/)",
]);

console.log(`\nElectron package ready in ${outputDir}/ for ${platform}-${arch}.`);
