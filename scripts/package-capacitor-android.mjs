import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipBuild = args.has("--skip-build");
const mode = process.argv.find((arg) => arg === "debug" || arg === "release") || "debug";
const root = process.cwd();
const unsafeTwilioVoiceHook = "capacitor:sync:after";

function resolveJavaEnv() {
  const env = { ...process.env };
  if (env.JAVA_HOME) return env;

  if (process.platform === "win32") {
    const androidStudioJbr = "C:\\Program Files\\Android\\Android Studio\\jbr";
    if (existsSync(join(androidStudioJbr, "bin", "java.exe"))) {
      env.JAVA_HOME = androidStudioJbr;
      env.PATH = `${join(androidStudioJbr, "bin")};${env.PATH || ""}`;
    }
  }

  return env;
}

function windowsAndroidStudioJbr() {
  if (process.platform !== "win32") return null;
  const androidStudioJbr = "C:\\Program Files\\Android\\Android Studio\\jbr";
  return existsSync(join(androidStudioJbr, "bin", "java.exe")) ? androidStudioJbr : null;
}

function removeWindowsUnsafeTwilioVoiceHook() {
  if (process.platform !== "win32" || dryRun) return;

  const packagePath = join(root, "node_modules", "@capgo", "capacitor-twilio-voice", "package.json");
  if (!existsSync(packagePath)) return;

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const scripts = packageJson.scripts || {};
  const syncHook = scripts[unsafeTwilioVoiceHook];
  if (typeof syncHook !== "string") return;

  const usesUnixPipe = syncHook.includes("base64 -d") && syncHook.includes("| bash");
  if (!usesUnixPipe) return;

  delete scripts[unsafeTwilioVoiceHook];
  packageJson.scripts = scripts;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log("\nRemoved Windows-unsafe Twilio Voice Capacitor sync hook.");
}

function run(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`\n> ${printable}`);
  if (dryRun) return;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: resolveJavaEnv(),
    ...options,
  });
  if (result.status !== 0) {
    if (options.allowFailure) return result.status ?? 1;
    process.exit(result.status ?? 1);
  }
  return 0;
}

if (!skipBuild) {
  run("npm", ["run", "build"]);
}

if (!existsSync(join(root, "android"))) {
  run("npx", ["cap", "add", "android"]);
}

removeWindowsUnsafeTwilioVoiceHook();

const syncStatus = run("npx", ["cap", "sync", "android"], { allowFailure: true });
if (syncStatus !== 0) {
  const copiedIndex = join(root, "android", "app", "src", "main", "assets", "public", "index.html");
  if (!existsSync(copiedIndex)) {
    console.error("\nCapacitor sync failed before web assets were copied.");
    process.exit(syncStatus);
  }
  console.warn("\nCapacitor sync reported a Windows-only plugin hook warning after copying web assets. Continuing with Gradle build.");
}

const gradle = process.platform === "win32"
  ? join(root, "android", "gradlew.bat")
  : join(root, "android", "gradlew");

if (!existsSync(gradle)) {
  console.log("\nAndroid project synced. Gradle wrapper was not found, so no APK was built.");
  process.exit(0);
}

const gradleArgs = [];
const javaHomeForGradle = windowsAndroidStudioJbr();
if (javaHomeForGradle) {
  gradleArgs.push(`"-Dorg.gradle.java.home=${javaHomeForGradle}"`);
}
gradleArgs.push(mode === "release" ? "assembleRelease" : "assembleDebug");

run(gradle, gradleArgs, {
  cwd: join(root, "android"),
});

console.log(`\nAndroid ${mode} build finished.`);
