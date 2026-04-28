import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const envFiles = [".env.tools.local", ".env.local", ".env"];

function loadEnvFiles() {
  for (const file of envFiles) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      process.env[key] = value;
    }
  }
}

function looksLikeSupabaseApiKey(value) {
  return (
    value.startsWith("eyJ") ||
    value.startsWith("sb_publishable_") ||
    value.startsWith("sb_secret_")
  );
}

function requireEnv(name, aliases = [], options = {}) {
  const names = [name, ...aliases];
  for (const key of names) {
    const value = process.env[key]?.trim();
    if (!value) continue;
    if (options.supabaseApiKey && !looksLikeSupabaseApiKey(value)) continue;
    return value;
  }
  throw new Error(`Missing ${names.join(" or ")}. Add it to .env.tools.local for this live smoke test.`);
}

async function fetchServiceRoleKeyFromSupabaseApi() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  if (!accessToken || !projectRef) return null;

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Supabase management API key lookup failed with HTTP ${response.status}.`);
  }
  const payload = await response.json();
  const keys = Array.isArray(payload) ? payload : payload.api_keys ?? payload.keys ?? [];
  const serviceRole = keys.find((item) => item?.name === "service_role");
  const apiKey = serviceRole?.api_key ?? serviceRole?.key;
  return apiKey && looksLikeSupabaseApiKey(apiKey) ? apiKey : null;
}

async function resolveSupabaseApiKey() {
  const serviceRoleFromApi = await fetchServiceRoleKeyFromSupabaseApi();
  if (serviceRoleFromApi) return { key: serviceRoleFromApi, source: "Supabase management API service_role" };

  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY", [
    "SERVICE_ROLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ], { supabaseApiKey: true });
  return { key, source: "local env Supabase API key" };
}

function argEnabled(name) {
  return process.argv.includes(name);
}

function shortId() {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

function assertStep(condition, message) {
  if (!condition) throw new Error(message);
}

function printStep(status, message, detail = "") {
  const icon = status === "ok" ? "PASS" : status === "skip" ? "SKIP" : "FAIL";
  console.log(`${icon} ${message}${detail ? ` - ${detail}` : ""}`);
}

async function cleanupRecords(supabase, leadId, actionItemIds) {
  const errors = [];
  if (actionItemIds.length) {
    const { error } = await supabase.from("action_items").delete().in("id", actionItemIds);
    if (error) errors.push(`action_items cleanup: ${error.message}`);
  }
  if (leadId) {
    const { error } = await supabase.from("leads").delete().eq("id", leadId);
    if (error) errors.push(`lead cleanup: ${error.message}`);
  }
  if (errors.length) throw new Error(errors.join("; "));
}

async function main() {
  loadEnvFiles();

  const keepFakeLead = argEnabled("--keep") || process.env.E2E_KEEP_FAKE_LEAD === "1";
  const testEmail = process.env.E2E_ADMIN_EMAIL?.trim();
  const testPassword = process.env.E2E_ADMIN_PASSWORD?.trim();
  const supabaseUrl = requireEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"]);
  const { key: supabaseKey, source: supabaseKeySource } = await resolveSupabaseApiKey();

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = shortId();
  const marker = `E2E_FAKE_LEAD_${new Date().toISOString()}_${runId}`;
  const phone = `+1210555${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const email = `e2e.fake.lead+${runId}@example.com`;
  let leadId = null;
  const actionItemIds = [];

  console.log("\nUltraOffice2.0 fake lead E2E smoke test");
  console.log(`Marker: ${marker}`);
  console.log(`Cleanup: ${keepFakeLead ? "disabled (--keep)" : "enabled"}`);
  console.log(`Supabase key source: ${supabaseKeySource}`);

  try {
    if (testEmail && testPassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      if (signInError) throw signInError;
      printStep("ok", "Signed in with E2E test user");
    } else {
      printStep("skip", "No E2E test login supplied", "using configured Supabase API key only");
    }

    const { data: insertedLead, error: leadInsertError } = await supabase
      .from("leads")
      .insert({
        first_name: "E2E",
        last_name: `Fake Lead ${runId}`,
        phone,
        email,
        source: "e2e_fake_lead",
        status: "new",
        intent: "service_request",
        notes: `${marker} - SAFE TEST RECORD - OK TO DELETE`,
        raw_payload: {
          e2e: true,
          marker,
          source: "e2e_fake_lead",
          requested_service: "AC tune up smoke test",
        },
      })
      .select("id, first_name, last_name, phone, email, source, status, raw_payload")
      .single();

    if (leadInsertError) throw leadInsertError;
    leadId = insertedLead.id;
    assertStep(insertedLead.status === "new", "Lead insert did not preserve status=new.");
    printStep("ok", "Created fake lead", leadId);

    const { data: insertedActionItem, error: actionInsertError } = await supabase
      .from("action_items")
      .insert({
        category: "new_lead",
        title: `New fake lead: ${insertedLead.first_name} ${insertedLead.last_name}`,
        description: "E2E smoke test lead for dispatcher intake flow.",
        customer_phone: phone,
        facts: {
          e2e: true,
          marker,
          lead_id: leadId,
          phone,
          source: "e2e_fake_lead",
        },
        metadata: {
          e2e: true,
          marker,
          lead_id: leadId,
          safe_to_delete: true,
        },
        priority: "high",
        source: "e2e_fake_lead",
        status: "pending",
        suggested_action: "Review fake lead, link or book only during E2E testing.",
      })
      .select("id, category, status, source, customer_phone, metadata")
      .single();

    if (actionInsertError) throw actionInsertError;
    actionItemIds.push(insertedActionItem.id);
    printStep("ok", "Created NOW/action item for fake lead", insertedActionItem.id);

    const { data: leadCheck, error: leadCheckError } = await supabase
      .from("leads")
      .select("id, status, phone, source, raw_payload")
      .eq("id", leadId)
      .single();
    if (leadCheckError) throw leadCheckError;
    assertStep(leadCheck?.raw_payload?.marker === marker, "Lead marker verification failed.");
    printStep("ok", "Verified fake lead can be read back");

    const { data: actionCandidates, error: actionCheckError } = await supabase
      .from("action_items")
      .select("id, category, status, source, customer_phone, metadata")
      .eq("source", "e2e_fake_lead")
      .eq("customer_phone", phone)
      .eq("status", "pending");
    if (actionCheckError) throw actionCheckError;
    const matchingAction = (actionCandidates ?? []).find((item) => item.metadata?.marker === marker);
    assertStep(Boolean(matchingAction), "Could not find matching pending NOW/action item.");
    printStep("ok", "Verified fake lead appears as pending dispatcher work");

    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({
        status: "contacted",
        contacted_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .select("id, status, contacted_at")
      .single();
    if (updateError) throw updateError;
    assertStep(updatedLead.status === "contacted", "Lead status update did not persist.");
    printStep("ok", "Simulated dispatcher follow-up status update");

    if (keepFakeLead) {
      printStep("skip", "Cleanup skipped for UI testing", `lead=${leadId}, action_item=${actionItemIds.join(",")}`);
    } else {
      await cleanupRecords(supabase, leadId, actionItemIds);
      printStep("ok", "Cleaned up fake lead and action item");
      leadId = null;
      actionItemIds.length = 0;
    }

    console.log("\nResult: fake lead E2E smoke test passed.");
  } catch (error) {
    console.error(`\nResult: fake lead E2E smoke test failed: ${error.message}`);
    if (/row-level security/i.test(error.message)) {
      console.error(
        "Hint: this needs SUPABASE_SERVICE_ROLE_KEY in .env.tools.local, or E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD for a test user that can create leads."
      );
    }
    if (!keepFakeLead && (leadId || actionItemIds.length)) {
      try {
        await cleanupRecords(supabase, leadId, actionItemIds);
        printStep("ok", "Cleaned up partial fake test data");
      } catch (cleanupError) {
        printStep("fail", "Cleanup needs manual attention", cleanupError.message);
      }
    }
    process.exitCode = 1;
  }
}

main();
