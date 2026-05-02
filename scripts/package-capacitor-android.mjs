import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipBuild = args.has("--skip-build");
const mode = process.argv.find((arg) => arg === "debug" || arg === "release") || "debug";
const root = process.cwd();

function run(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`\n> ${printable}`);
  if (dryRun) return;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!skipBuild) {
  run("npm", ["run", "build"]);
}

if (!existsSync(join(root, "android"))) {
  run("npx", ["cap", "add", "android"]);
}

run("npx", ["cap", "sync", "android"]);

const gradle = process.platform === "win32"
  ? join(root, "android", "gradlew.bat")
  : join(root, "android", "gradlew");

if (!existsSync(gradle)) {
  console.log("\nAndroid project synced. Gradle wrapper was not found, so no APK was built.");
  process.exit(0);
}

run(gradle, [mode === "release" ? "assembleRelease" : "assembleDebug"], {
  cwd: join(root, "android"),
});

console.log(`\nAndroid ${mode} build finished.`);
