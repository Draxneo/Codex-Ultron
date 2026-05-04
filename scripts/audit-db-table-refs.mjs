import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = ["src", path.join("supabase", "functions")];
const skipParts = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}dist${path.sep}`,
  `${path.sep}.git${path.sep}`,
  path.join("src", "integrations", "supabase", "types.ts"),
];
const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skipParts.some((part) => full.includes(part))) continue;
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (codeExts.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function generatedNames(kind) {
  const typesPath = path.join(root, "src", "integrations", "supabase", "types.ts");
  if (!fs.existsSync(typesPath)) return new Set();
  const text = fs.readFileSync(typesPath, "utf8");
  const start = text.indexOf(`    ${kind}: {`);
  if (start === -1) return new Set();
  const rest = text.slice(start + `    ${kind}: {`.length);
  const end = rest.indexOf("\n    }");
  const block = end === -1 ? rest : rest.slice(0, end);
  const names = new Set();
  for (const match of block.matchAll(/^\s{6}([a-zA-Z0-9_]+): \{/gm)) {
    names.add(match[1]);
  }
  return names;
}

const tableNames = new Set([...generatedNames("Tables"), ...generatedNames("Views")]);
const references = new Map();

function add(name, file, line, kind) {
  if (!references.has(name)) references.set(name, []);
  references.get(name).push({ file: path.relative(root, file), line, kind });
}

for (const file of scanRoots.flatMap((dir) => walk(path.join(root, dir)))) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((lineText, index) => {
    for (const match of lineText.matchAll(/\.from\(\s*["']([a-zA-Z0-9_]+)["']/g)) {
      const previousLine = index > 0 ? lines[index - 1] : "";
      const before = `${previousLine}\n${lineText.slice(Math.max(0, match.index - 80), match.index)}`;
      if (before.includes(".storage")) continue;
      add(match[1], file, index + 1, "from()");
    }

    for (const match of lineText.matchAll(/\btable:\s*["']([a-zA-Z0-9_]+)["']/g)) {
      add(match[1], file, index + 1, "realtime table");
    }
  });
}

const names = [...references.keys()].sort();
const missingFromGenerated = names.filter((name) => !tableNames.has(name));

if (process.argv.includes("--sql")) {
  const values = names.map((name) => `('${name.replaceAll("'", "''")}')`).join(",\n");
  console.log(`with referenced(name) as (
  values
${values}
)
select r.name
from referenced r
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = r.name
left join information_schema.views v
  on v.table_schema = 'public'
 and v.table_name = r.name
where t.table_name is null
  and v.table_name is null
order by r.name;`);
  process.exit(0);
}

console.log(`Referenced public tables/views: ${names.length}`);
console.log(`Known in generated Supabase types: ${tableNames.size}`);
console.log("\nFor a live database check, run:");
console.log("  node scripts/audit-db-table-refs.mjs --sql");
console.log("Then execute that SQL against the live Supabase project.");

if (missingFromGenerated.length && process.argv.includes("--types")) {
  console.log("\nNot present in generated Supabase types. These may be real issues, or the generated types may be stale:");
  for (const name of missingFromGenerated) {
    console.log(`- ${name}`);
    for (const ref of references.get(name).slice(0, 5)) {
      console.log(`  ${ref.file}:${ref.line} (${ref.kind})`);
    }
  }
} else if (missingFromGenerated.length) {
  console.log(`\n${missingFromGenerated.length} references are not in generated Supabase types. Run with --types to list them.`);
} else {
  console.log("\nNo code references are missing from generated Supabase types.");
}

if (process.argv.includes("--strict-types") && missingFromGenerated.length) {
  process.exitCode = 1;
}
