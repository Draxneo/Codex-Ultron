import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipNativeBuild = args.has("--skip-native-build");

function run(command, commandArgs) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`\n> ${printable}`);
  if (dryRun) return;
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npm", ["run", "build"]);
run("npm", ["run", "electron:pack", "--", "--skip-build"]);

if (!skipNativeBuild) {
  run("npm", ["run", "cap:android:debug", "--", "--skip-build"]);
} else {
  run("npx", ["cap", "sync", "android"]);
}

console.log("\nClient release workflow finished.");
