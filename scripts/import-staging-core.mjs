import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OLD_PROJECT_REF = 'rjubzymeivdsjjhvdlci';
const DEFAULT_EXPORT_DIR = 'exports/old-supabase-2026-04-26T10-44-26-328Z';
const CHUNK_SIZE = Number(process.env.IMPORT_CHUNK_SIZE || 200);

const targetUrl = process.env.TARGET_SUPABASE_URL;
const serviceRoleKey = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY;
const exportDir = path.resolve(process.env.EXPORT_DIR || DEFAULT_EXPORT_DIR);
const dryRun = process.env.DRY_RUN !== 'false';

if (!dryRun && (!targetUrl || !serviceRoleKey)) {
  console.error('Missing TARGET_SUPABASE_URL or TARGET_SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Set those to the NEW staging Supabase project. Do not use the old project.');
  process.exit(1);
}

if (targetUrl?.includes(OLD_PROJECT_REF)) {
  console.error('Refusing to import into the old live Supabase project.');
  process.exit(1);
}

if (!dryRun && !serviceRoleKey.includes('.')) {
  console.error('The key does not look like a Supabase service-role JWT.');
  process.exit(1);
}

const manifestPath = path.resolve('scripts/staging-core-tables.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const supabase = dryRun ? null : createClient(targetUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const results = [];
const skippedTables = new Set(['profiles', 'user_roles']);

const stripColumns = {
  knowledge_chunks: ['fts'],
  weather_forecast_cache: ['id'],
  job_line_items: ['template_id'],
  employees: ['profile_id']
};

const referenceSets = {};

function normalizeRows(table, rows) {
  let normalized = rows.map((row) => ({ ...row }));

  for (const column of stripColumns[table] || []) {
    normalized = normalized.map((row) => {
      delete row[column];
      return row;
    });
  }

  if (table === 'job_carts') {
    const seenOpenJobs = new Set();
    normalized = normalized.map((row) => {
      if (['active', 'draft', 'sent', 'approved'].includes(row.status) && row.job_id) {
        if (seenOpenJobs.has(row.job_id)) {
          return { ...row, status: 'archived', notes: `${row.notes || ''}\n[Archived during staging import: duplicate active cart for job]`.trim() };
        }
        seenOpenJobs.add(row.job_id);
      }
      return row;
    });
  }

  if (table === 'call_log') {
    normalized = normalized.map((row) => ({
      ...row,
      related_customer_id: row.related_customer_id && !referenceSets.customers?.has(row.related_customer_id) ? null : row.related_customer_id,
      related_vendor_id: row.related_vendor_id && !referenceSets.vendor_contacts?.has(row.related_vendor_id) ? null : row.related_vendor_id
    }));
  }

  if (table === 'sms_log') {
    normalized = normalized.map((row) => ({
      ...row,
      related_vendor_id: row.related_vendor_id && !referenceSets.vendor_contacts?.has(row.related_vendor_id) ? null : row.related_vendor_id
    }));
  }

  return normalized;
}

async function clearCartTables() {
  const zeroUuid = '00000000-0000-0000-0000-000000000000';
  await supabase.from('job_cart_items').delete().neq('id', zeroUuid);
  await supabase.from('job_carts').delete().neq('id', zeroUuid);
}

async function clearEmployeeTabAccess() {
  const zeroUuid = '00000000-0000-0000-0000-000000000000';
  await supabase.from('employee_tab_access').delete().neq('id', zeroUuid);
}

async function readRows(table) {
  const file = path.join(exportDir, `${table}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function chunks(rows, size) {
  const out = [];
  for (let index = 0; index < rows.length; index += size) {
    out.push(rows.slice(index, index + size));
  }
  return out;
}

for (const table of manifest.coreImportOrder) {
  if (skippedTables.has(table)) {
    results.push({ table, status: 'skipped for staging', rows: 0 });
    continue;
  }

  const rows = await readRows(table);
  if (!rows) {
    results.push({ table, status: 'missing export file', rows: 0 });
    continue;
  }

  if (!Array.isArray(rows)) {
    results.push({ table, status: 'not an array', rows: 0 });
    continue;
  }

  if (rows.length === 0) {
    results.push({ table, status: 'empty', rows: 0 });
    continue;
  }

  const normalizedRows = normalizeRows(table, rows);

  if (['customers', 'jobs', 'vendor_contacts', 'employees', 'tech_forms', 'job_carts'].includes(table)) {
    referenceSets[table] = new Set(normalizedRows.map((row) => row.id).filter(Boolean));
  }

  if (dryRun) {
    results.push({ table, status: 'dry-run ready', rows: normalizedRows.length });
    continue;
  }

  let imported = 0;
  if (table === 'employee_tab_access') {
    await clearEmployeeTabAccess();
  }

  if (table === 'job_carts') {
    await clearCartTables();
  }

  for (const group of chunks(normalizedRows, CHUNK_SIZE)) {
    const hasId = group.every((row) => Object.hasOwn(row, 'id'));
    const query = hasId
      ? supabase.from(table).upsert(group, { onConflict: 'id' })
      : supabase.from(table).insert(group);
    const { error } = await query;
    if (error) {
      results.push({ table, status: 'failed', rows: imported, error: error.message });
      console.error(`Failed importing ${table}: ${error.message}`);
      break;
    }
    imported += group.length;
  }

  if (imported === normalizedRows.length) {
    results.push({ table, status: 'imported', rows: imported });
  }
}

const outputDir = path.resolve('exports/staging-import-runs');
await fs.mkdir(outputDir, { recursive: true });
const reportPath = path.join(outputDir, `core-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await fs.writeFile(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  dryRun,
  exportDir,
  targetUrl: targetUrl || '(not set for dry run)',
  chunkSize: CHUNK_SIZE,
  results
}, null, 2));

const totals = results.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + row.rows;
  return acc;
}, {});

console.log(JSON.stringify({ dryRun, reportPath, totals, tables: results.length }, null, 2));
