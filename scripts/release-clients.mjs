import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipNativeBuild = args.has("--skip-native-build");
const desktopReleaseDir = join(process.env.USERPROFILE || process.env.HOME || ".", "Desktop", "Ultra Office 2.0");

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

if (!dryRun) {
  mkdirSync(desktopReleaseDir, { recursive: true });

  const electronSource = join(process.cwd(), "electron-release", "UltraOffice-win32-x64");
  if (existsSync(electronSource)) {
    for (const folderName of ["UltraOffice-win32-x64", "UltraOffice Desktop - Windows"]) {
      const electronTarget = join(desktopReleaseDir, folderName);
      rmSync(electronTarget, { recursive: true, force: true });
      cpSync(electronSource, electronTarget, { recursive: true });
    }
  }

  const apkSource = join(process.cwd(), "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (existsSync(apkSource)) {
    for (const fileName of ["UltraOffice-debug.apk", "UltraOffice Android Debug.apk"]) {
      cpSync(apkSource, join(desktopReleaseDir, fileName));
    }
  }

  console.log(`\nLatest Windows and Android builds copied to ${desktopReleaseDir}`);
}

console.log("\nClient release workflow finished.");
