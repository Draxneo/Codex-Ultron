import fs from "node:fs";

const envFiles = [".env", ".env.local", ".env.tools.local"];

const frontendAllowed = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_GOOGLE_MAPS_API_KEY",
]);

const toolsAllowed = new Set([
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "DEEPGRAM_API_KEY",
  "HOUSECALL_PRO_API_KEY",
  "HOUSECALL_PRO_BASE_URL",
  "PORT",
  "PUBLIC_BASE_URL",
  "RENDER_API_KEY",
  "RENDER_SERVICE_ID",
  "RENDER_TARGET_SERVICE_NAME",
  "SESSION_SECRET",
  "SUPABASE_DB_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SCHEMA",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SUPABASE_URL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_API_KEY_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_SOFTPHONE_IDENTITY",
]);

function readNames(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
    .map(({ line, index }) => ({ name: line.split("=", 1)[0].trim(), index }));
}

let failed = false;

for (const file of envFiles) {
  const names = readNames(file);
  if (names.length === 0) continue;
  const allowed = file === ".env.tools.local" ? toolsAllowed : frontendAllowed;
  const unexpected = names.filter(({ name }) => !allowed.has(name));
  if (unexpected.length) {
    failed = true;
    console.error(`\n${file} has unexpected env names:`);
    for (const item of unexpected) console.error(`  line ${item.index}: ${item.name}`);
  }
}

const deprecated = [
  ["TWILIO_API_KEY", "TWILIO_API_KEY_SID"],
  ["TWILIO_API_SECRET", "TWILIO_API_KEY_SECRET"],
  ["HOUSECALL_PRO_API_KEY", "HCP_API_KEY for Supabase function secrets"],
];

for (const file of envFiles) {
  const names = new Set(readNames(file).map(({ name }) => name));
  for (const [oldName, newName] of deprecated) {
    if (names.has(oldName) && file !== ".env.tools.local") {
      failed = true;
      console.error(`\n${file} uses deprecated ${oldName}; use ${newName}.`);
    }
  }
}

if (failed) process.exit(1);
console.log("Env audit passed. Frontend env is public-only; tool/server env is isolated.");
