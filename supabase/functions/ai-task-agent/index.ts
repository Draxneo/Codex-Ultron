import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { formatDateUS, formatTimeCentral, getCentralToday, getCentralNow, getCentralTimeStrings, detectCentralOffset } from "../_shared/formatters.ts";
import { logApiUsage } from "../_shared/apiUsageLog.ts";
import { estimateCostCents } from "../_shared/aiPricing.ts";
import { verifyAddress } from "../_shared/verifyContact.ts";
import { getTaskModel } from "../_shared/getTaskModel.ts";
import { scrape as fc2Scrape, search as fc2Search, getKey as fc2GetKey } from "../_shared/firecrawl-v2.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { calcMonthly120 } from "../_shared/paymentOptions.ts";



// Production base URL for form links
const APP_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("APP_BASE_URL") || "https://codex-ultron.onrender.com";

async function getTaskContext(sb: any) {
  // OPTIMIZED: capped at 40 active jobs (was 100). The schedule summary already
  // surfaces today/tomorrow/this-week — older jobs are reachable via search_jobs tool.
  const jobsResult = await sb.from("jobs")
    .select("id, hcp_job_number, customer_name, job_type, scheduled_date, status, assigned_to, brand, tonnage, system_type, ahri_number, description, address, hcp_note, customer_phone, customer_email, arrival_start, arrival_end, hcp_customer_id, orientation")
    .not("status", "in", '("done","invoiced","canceled")')
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .limit(40);

  const allJobs = jobsResult.data || [];
  if (jobsResult.error) console.error("JOBS_QUERY_ERROR:", JSON.stringify(jobsResult.error));

  const today = getCentralToday();

  return {
    today,
    allJobs,
  };
}

// ==================== Schedule Summary Context ====================
// Pre-digested, date-organized view of jobs with inline equipment.
// This is the PRIMARY data source the agent should use for date-based questions.

async function getScheduleSummaryContext(sb: any, allJobs: any[]) {
  
  if (allJobs.length === 0) return "";

  // Get the authoritative "today" in Central Time using reliable manual offset
  const now = getCentralNow();
  const todayDate = getCentralToday();
  const tomorrow = new Date(now.getTime() + 86400000);
  const ty = tomorrow.getUTCFullYear();
  const tm = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
  const td = String(tomorrow.getUTCDate()).padStart(2, "0");
  const tomorrowDate = `${ty}-${tm}-${td}`;

  // Get all job IDs for bulk lookups
  const jobIds = allJobs.map((j: any) => j.id);

  // Fetch line items and job equipment for ALL active jobs in one go
  const [lineItemsResult, jobEquipResult] = await Promise.all([
    sb.from("job_line_items")
      .select("name, description, kind, quantity, unit_price, total_price, job_id")
      .in("job_id", jobIds)
      .order("created_at"),
    sb.from("job_equipment")
      .select("model_number, serial_number, equipment_type, brand, job_id")
      .in("job_id", jobIds),
  ]);

  const lineItems = lineItemsResult.data || [];
  const jobEquip = jobEquipResult.data || [];

  // Index by job_id
  const liByJob: Record<string, any[]> = {};
  for (const li of lineItems) {
    if (!liByJob[li.job_id]) liByJob[li.job_id] = [];
    liByJob[li.job_id].push(li);
  }
  const eqByJob: Record<string, any[]> = {};
  for (const eq of jobEquip) {
    if (!eqByJob[eq.job_id]) eqByJob[eq.job_id] = [];
    eqByJob[eq.job_id].push(eq);
  }

  // Group jobs by date bucket
  const buckets: Record<string, any[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    this_week: [],
    later: [],
    unscheduled: [],
  };

  const weekEnd = new Date(now.getTime() + 7 * 86400000);
  const wy = weekEnd.getUTCFullYear();
  const wm = String(weekEnd.getUTCMonth() + 1).padStart(2, "0");
  const wd = String(weekEnd.getUTCDate()).padStart(2, "0");
  const weekEndDate = `${wy}-${wm}-${wd}`;

  for (const job of allJobs) {
    const sd = job.scheduled_date;
    if (!sd) {
      buckets.unscheduled.push(job);
    } else if (sd === todayDate) {
      buckets.today.push(job);
    } else if (sd === tomorrowDate) {
      buckets.tomorrow.push(job);
    } else if (sd > tomorrowDate && sd <= weekEndDate) {
      buckets.this_week.push(job);
    } else if (sd > weekEndDate) {
      buckets.later.push(job);
    } else {
      // Past dates still in active status — show as overdue, NOT today
      buckets.overdue.push(job);
    }
  }
  



  function formatJobBlock(job: any, showDate = false): string {
    const items = liByJob[job.id] || [];
    const equip = eqByJob[job.id] || [];

    let block = `  📋 Job #${job.hcp_job_number || "N/A"} (id: ${job.id}) | ${job.customer_name || "Unknown"} | ${job.job_type || "?"} | Tech: ${job.assigned_to || "UNASSIGNED"} | Status: ${job.status}${job.customer_id ? ` | customer_id: ${job.customer_id}` : ""}`;
    if (showDate && job.scheduled_date) block += `\n     📅 Date: ${formatDateUS(job.scheduled_date)}`;
    if (job.address) block += `\n     📍 ${job.address}`;
    if (job.arrival_start) {
      const startFmt = formatTimeCentral(job.arrival_start);
      const endFmt = job.arrival_end ? formatTimeCentral(job.arrival_end) : "";
      block += `\n     🕐 Arrival: ${startFmt}${endFmt ? " – " + endFmt + " CST" : ""}`;
    }
    if (job.description) block += `\n     📝 ${job.description.slice(0, 150)}`;
    if (job.brand || job.tonnage) block += `\n     🏷️ ${[job.brand, job.tonnage ? job.tonnage + "T" : null, job.system_type, job.orientation ? "Orientation: " + job.orientation : null].filter(Boolean).join(" / ")}`;

    if (items.length > 0) {
      block += `\n     ── LINE ITEMS (${items.length}) ──`;
      for (const li of items) {
        block += `\n     • ${li.name}${li.description ? " — " + li.description : ""}${li.kind ? " [" + li.kind + "]" : ""} (qty: ${li.quantity}, $${li.total_price})`;
      }
    }
    if (equip.length > 0) {
      block += `\n     ── EQUIPMENT (photo-verified) ──`;
      for (const eq of equip) {
        block += `\n     • ${eq.equipment_type || "?"}: ${eq.brand || ""} ${eq.model_number || "?"}${eq.serial_number ? " S/N: " + eq.serial_number : ""}`;
      }
    }
    if (items.length === 0 && equip.length === 0) {
      block += `\n     ⚠️ NO LINE ITEMS OR EQUIPMENT DATA ON THIS JOB — DO NOT INVENT MODEL NUMBERS. The ONLY equipment info is the job description and brand/tonnage fields above. Report those exactly and note that specific part numbers are not yet on file.`;
    }
    return block;
  }

  const sections: string[] = [];
  const labels: [string, string][] = [
    ["overdue", `⚠️ OVERDUE / PAST-DUE (still active but scheduled before ${formatDateUS(todayDate)})`],
    ["today", `📅 TODAY (${formatDateUS(todayDate)})`],
    ["tomorrow", `📅 TOMORROW (${formatDateUS(tomorrowDate)})`],
    ["this_week", `📅 THIS WEEK`],
    ["later", `📅 LATER`],
    ["unscheduled", `📅 UNSCHEDULED / NEEDS FOLLOW-UP`],
  ];

  // Show individual dates for buckets that span multiple days
  const multiDayBuckets = new Set(["this_week", "later", "overdue"]);

  for (const [key, label] of labels) {
    const jobs = buckets[key];
    if (jobs.length > 0) {
      const showDate = multiDayBuckets.has(key);
      // Sort multi-day buckets by date for clarity
      if (showDate) jobs.sort((a: any, b: any) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""));
      const jobBlocks = jobs.map((j: any) => formatJobBlock(j, showDate)).join("\n\n");
      sections.push(`${label} (${jobs.length} jobs):\n${jobBlocks}`);
    } else if (key === "today" || key === "tomorrow") {
      sections.push(`${label}: No jobs scheduled.`);
    }
  }

  return `\n\n${"=".repeat(60)}\nSCHEDULE SUMMARY (THIS IS YOUR PRIMARY SOURCE FOR DATE-BASED QUESTIONS)\n${"=".repeat(60)}\n${sections.join("\n\n")}`;
}

async function getEmployeesContext(sb: any) {
  const { data } = await sb
    .from("employees")
    .select("id, name, role, phone, is_active, home_address")
    .order("name");
  return data || [];
}

async function getSmsTemplatesContext(sb: any) {
  const { data } = await sb
    .from("sms_templates")
    .select("name, category, template_body")
    .eq("is_active", true)
    .order("category");
  if (!data || data.length === 0) return "";
  const lines = data.map((t: any) => `- [${t.category}] ${t.name}:\n${t.template_body}`);
  return `\n\nSMS TEMPLATES (${data.length} active):\n${lines.join("\n\n")}`;
}

async function getPartsCatalogContext(sb: any) {
  const { data: parts } = await sb.from("parts_catalog").select("id, name, category").order("name");
  const { data: nums } = await sb.from("part_supply_house_numbers").select("part_id, part_number, unit_cost, supply_houses(name)");
  const { data: houses } = await sb.from("supply_houses").select("id, name").eq("is_active", true);
  const partList = (parts || []).map((p: any) => {
    const refs = (nums || []).filter((n: any) => n.part_id === p.id)
      .map((n: any) => `${n.supply_houses?.name || "?"}: #${n.part_number}${n.unit_cost ? " $" + n.unit_cost : ""}`).join(", ");
    return `- ${p.name} (${p.category || "general"})${refs ? " — " + refs : ""}`;
  });
  return partList.length > 0 ? `\n\nPARTS CATALOG (${partList.length} parts):\n${partList.join("\n")}` : "";
}

async function getInvoicesContext(sb: any) {
  const { data } = await sb.from("job_invoices")
    .select("invoice_number, total_amount, model_number, serial_number, extraction_status, created_at, uploaded_by, jobs(hcp_job_number, customer_name)")
    .order("created_at", { ascending: false }).limit(100);
  if (!data || data.length === 0) return "";
  const lines = data.map((i: any) =>
    `- Invoice ${i.invoice_number || "N/A"} for job #${i.jobs?.hcp_job_number || "?"} (${i.jobs?.customer_name || "?"}) — $${i.total_amount || "?"}${i.model_number ? " — model: " + i.model_number : ""}${i.serial_number ? " / serial: " + i.serial_number : ""} [${i.extraction_status}]`
  );
  return `\n\nRECENT INVOICES (${lines.length}):\n${lines.join("\n")}`;
}

// Job line items — the actual parts, equipment, and materials listed on each job card
async function getJobLineItemsContext(sb: any) {
  const { data } = await sb.from("job_line_items")
    .select("name, description, kind, quantity, unit_price, total_price, job_id, jobs(hcp_job_number, customer_name, assigned_to, scheduled_date, job_type)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!data || data.length === 0) return "";

  const grouped: Record<string, { job: any; items: any[] }> = {};
  for (const li of data) {
    const jobKey = li.jobs?.hcp_job_number || li.job_id;
    if (!grouped[jobKey]) grouped[jobKey] = { job: li.jobs, items: [] };
    grouped[jobKey].items.push(li);
  }

  const lines: string[] = [];
  for (const [jobKey, g] of Object.entries(grouped)) {
    const jobLabel = g.job
      ? `Job #${g.job.hcp_job_number} (${g.job.customer_name}, ${g.job.job_type || "?"}, tech: ${g.job.assigned_to || "unassigned"}, sched: ${g.job.scheduled_date ? formatDateUS(g.job.scheduled_date) : "unscheduled"})`
      : `Job ${jobKey}`;
    const itemLines = g.items.map((li: any) =>
      `  • ${li.name}${li.description ? " — " + li.description : ""}${li.kind ? " [" + li.kind + "]" : ""} (qty: ${li.quantity}, $${li.total_price})`
    ).join("\n");
    lines.push(`- ${jobLabel}:\n${itemLines}`);
  }
  return `\n\nJOB LINE ITEMS (actual parts/equipment/materials on job cards, ${data.length} items across ${Object.keys(grouped).length} jobs):\n${lines.join("\n")}`;
}

async function getSmsHistoryContext(sb: any) {
  const { data } = await sb.from("sms_log")
    .select("id, direction, phone_number, body, created_at, related_job_id, media_urls, jobs(hcp_job_number, customer_name)")
    .order("created_at", { ascending: false }).limit(50);
  if (!data || data.length === 0) return "";
  const lines = data.map((m: any) => {
    const jobRef = m.jobs?.hcp_job_number ? ` [job #${m.jobs.hcp_job_number} - ${m.jobs.customer_name}]` : "";
    const mediaTag = m.media_urls && Array.isArray(m.media_urls) && m.media_urls.length > 0 ? ` [📷 ${m.media_urls.length} photo(s), sms_id:${m.id}]` : "";
    return `- [${m.direction}] ${m.phone_number}: "${m.body?.slice(0, 500) || "(no text)"}"${mediaTag}${jobRef} — ${formatDateUS(m.created_at)}`;
  });
  return `\n\nSMS HISTORY (last ${lines.length}):\n${lines.join("\n")}`;
}

async function getCallLogContext(sb: any) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb.from("call_log")
    .select("direction, phone_number, contact_name, contact_type, status, duration_seconds, recording_url, created_at, related_job_id, is_read, transcription, call_extraction, ai_summary")
    .order("created_at", { ascending: false }).limit(50);
  if (!data || data.length === 0) return "";
  const lines = data.map((c: any) => {
    const dur = c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m${c.duration_seconds % 60}s` : "0s";
    const name = c.contact_name || c.phone_number;
    const read = c.is_read ? "" : " [UNREAD]";
    const isRecent = c.created_at >= twentyFourHoursAgo || !c.is_read;

    // For recent/unread calls: show ALL available data so JARVIS can summarize
    let detail = "";
    const detailParts: string[] = [];
    if (isRecent && c.call_extraction) {
      const ex = c.call_extraction;
      const parts: string[] = [];
      if (ex.first_name || ex.last_name) parts.push(`name: ${(ex.first_name || "")} ${(ex.last_name || "")}`.trim());
      if (ex.address) parts.push(`addr: ${ex.address}${ex.city ? ", " + ex.city : ""}${ex.state ? " " + ex.state : ""}${ex.zip ? " " + ex.zip : ""}`);
      if (ex.service_type) parts.push(`service: ${ex.service_type}`);
      if (ex.problem_description) parts.push(`problem: ${ex.problem_description}`);
      if (ex.urgency) parts.push(`urgency: ${ex.urgency}`);
      if (ex.scheduling_preference) parts.push(`sched: ${ex.scheduling_preference}`);
      if (ex.phone) parts.push(`phone: ${ex.phone}`);
      if (ex.email) parts.push(`email: ${ex.email}`);
      detailParts.push(`EXTRACTED: {${parts.join("; ")}}`);
    }
    if (c.ai_summary) {
      detailParts.push(`summary: "${c.ai_summary.slice(0, 300)}"`);
    }
    if (isRecent && c.transcription) {
      detailParts.push(`transcript: "${c.transcription.slice(0, 500)}"`);
    }
    if (detailParts.length > 0) detail = ` | ${detailParts.join(" | ")}`;

    return `- [${c.direction}] ${name} (${c.contact_type}) — ${c.status}, ${dur}${c.recording_url ? " 🎙️" : ""}${read}${detail} — ${formatDateUS(c.created_at)}`;
  });
  const unread = data.filter((c: any) => !c.is_read).length;
  return `\n\nCALL LOG (last ${lines.length}, ${unread} unread):\n${lines.join("\n")}`;
}

async function getActivityLogContext(sb: any) {
  const { data } = await sb.from("activity_log")
    .select("action, performed_by, details, created_at, jobs(hcp_job_number)")
    .order("created_at", { ascending: false }).limit(50);
  if (!data || data.length === 0) return "";
  const lines = data.map((a: any) =>
    `- "${a.action}" by ${a.performed_by || "system"}${a.jobs?.hcp_job_number ? " — job #" + a.jobs.hcp_job_number : ""}${a.details ? " — " + a.details.slice(0, 80) : ""} — ${formatDateUS(a.created_at)}`
  );
  return `\n\nACTIVITY LOG (last ${lines.length}):\n${lines.join("\n")}`;
}

// Legacy getTaskTemplatesContext removed — workflow engine handles progression

// ==================== Company Knowledge Context ====================

async function getCompanySettingsContext(sb: any) {
  const { data } = await sb
    .from("company_settings")
    .select("key, value")
    .order("key");
  if (!data || data.length === 0) return "";
  // Filter out internal/large keys
  const skipKeys = new Set(["system_prompt", "archive_progress"]);
  const settings = data.filter((s: any) => !skipKeys.has(s.key));
  if (settings.length === 0) return "";
  const lines = settings.map((s: any) => `- ${s.key}: ${(s.value || "").slice(0, 200)}`);
  return `\n\nCOMPANY SETTINGS (${lines.length} keys — use these for company name, phone, email, URLs, feature flags):\n${lines.join("\n")}`;
}

async function getBrandProfilesContext(sb: any) {
  const { data } = await sb
    .from("brand_profiles")
    .select("brand_key, display_name, headline, subhead, accent_color, is_active")
    .order("brand_key");
  if (!data || data.length === 0) return "";
  const lines = data.map((b: any) =>
    `- ${b.display_name} (${b.brand_key})${b.is_active ? "" : " [INACTIVE]"}: "${b.headline}"${b.subhead ? " — " + b.subhead.slice(0, 80) : ""}`
  );
  return `\n\nBRAND PROFILES (${lines.length} brands available for presentations):\n${lines.join("\n")}`;
}

async function getPresentationSectionsContext(sb: any) {
  const { data } = await sb
    .from("presentation_sections")
    .select("section_key, title, subtitle, is_active")
    .eq("is_active", true)
    .order("sort_order");
  if (!data || data.length === 0) return "";
  const lines = data.map((s: any) =>
    `- ${s.section_key}: "${s.title}"${s.subtitle ? " — " + s.subtitle.slice(0, 60) : ""}`
  );
  return `\n\nPRESENTATION SECTIONS (${lines.length} active sections used in customer-facing documents):\n${lines.join("\n")}`;
}

async function getTrainingContext(sb: any) {
  const { data } = await sb
    .from("copilot_training")
    .select("category, content")
    .eq("is_active", true)
    .order("category");
  
  const { data: instructions } = await sb
    .from("agent_instructions")
    .select("label, content")
    .eq("is_active", true)
    .order("sort_order");

  let result = "";
  if (data && data.length > 0) {
    result += "\n\nKNOWLEDGE BASE (reference facts, tool guides, system info):\n" +
      data.map((t: any) => `[${t.category}]: ${t.content}`).join("\n");
  }
  if (instructions && instructions.length > 0) {
    const filled = instructions.filter((i: any) => i.content && i.content.trim());
    if (filled.length > 0) {
      result += "\n\nBEHAVIORAL INSTRUCTIONS (rules you MUST follow — these override general behavior):\n" +
        filled.map((i: any) => `[${i.label}]: ${i.content}`).join("\n\n");
    }
  }
  return result;
}

// ==================== CRM Context ====================

async function getCustomersContext(sb: any) {
  // OPTIMIZED: cap at 150 most-recent customers (was UNBOUNDED — could dump 5000+ rows).
  // For older customers, the agent must use the search_customer tool by name/phone/address.
  const { data: allCustomers } = await sb.from("customers")
    .select("id, first_name, last_name, company, email, phone, mobile_phone, address, city, state, zip, tags")
    .order("updated_at", { ascending: false })
    .limit(150);
  if (!allCustomers || allCustomers.length === 0) return "";
  // Compact format to keep token usage reasonable
  const lines = allCustomers.map((c: any) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "Unnamed";
    const contact = [c.phone, c.email].filter(Boolean).join(", ");
    const loc = [c.address, c.city, c.state].filter(Boolean).join(", ");
    const tags = c.tags?.length ? ` [${c.tags.join(", ")}]` : "";
    return `- ${name} (id: ${c.id})${c.company && c.first_name ? " (" + c.company + ")" : ""} | ${contact || "no contact"} | ${loc || "no address"}${tags}`;
  });
  return `\n\nRECENT CUSTOMERS (${allCustomers.length} most-recently-updated — for older customers use the search_customer tool):\n${lines.join("\n")}`;
}

async function getCustomerJobHistoryContext(sb: any) {
  // Get customers with their job counts and last job date using the existing RPC
  const { data } = await sb.rpc("get_customer_job_counts").limit(500);
  if (!data || data.length === 0) return "";

  // Get the top 50 most active customers' recent jobs
  const sorted = data.sort((a: any, b: any) => (b.job_count || 0) - (a.job_count || 0)).slice(0, 50);
  const customerIds = sorted.map((r: any) => r.customer_id);

  const { data: jobs } = await sb.from("jobs")
    .select("customer_id, hcp_job_number, job_type, status, scheduled_date, customer_name")
    .in("customer_id", customerIds)
    .order("scheduled_date", { ascending: false })
    .limit(200);

  if (!jobs || jobs.length === 0) return "";

  // Group by customer
  const grouped: Record<string, any[]> = {};
  for (const j of jobs) {
    if (!grouped[j.customer_name || j.customer_id]) grouped[j.customer_name || j.customer_id] = [];
    grouped[j.customer_name || j.customer_id].push(j);
  }

  const lines: string[] = [];
  for (const [name, custJobs] of Object.entries(grouped)) {
    const jobList = custJobs.slice(0, 5).map((j: any) =>
      `#${j.hcp_job_number || "?"} ${j.job_type || "?"} ${j.scheduled_date ? formatDateUS(j.scheduled_date) : "unscheduled"} [${j.status}]`
    ).join("; ");
    lines.push(`- ${name} (${custJobs.length} jobs): ${jobList}`);
  }
  return `\n\nCUSTOMER JOB HISTORY (top 50 active):\n${lines.join("\n")}`;
}

async function getCustomerPhotosContext(sb: any) {
  // Get recent job attachments with customer context
  const { data } = await sb.from("job_attachments")
    .select("id, file_name, file_type, created_at, jobs(hcp_job_number, customer_name, customer_id)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!data || data.length === 0) return "";

  // Group by customer
  const grouped: Record<string, number> = {};
  for (const a of data) {
    const name = a.jobs?.customer_name || "Unknown";
    grouped[name] = (grouped[name] || 0) + 1;
  }

  const lines = Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => `- ${name}: ${count} photo(s)`);

  return `\n\nCUSTOMER PHOTOS (recent attachments by customer):\n${lines.join("\n")}\nTotal recent attachments: ${data.length}`;
}

async function getCustomerInvoicesContext(sb: any) {
  const { data } = await sb.from("customer_invoices")
    .select("invoice_number, status, total, paid_at, created_at, jobs(hcp_job_number, customer_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!data || data.length === 0) return "";

  const lines = data.map((inv: any) =>
    `- ${inv.invoice_number || "N/A"} | ${inv.jobs?.customer_name || "?"} | $${inv.total || 0} | ${inv.status}${inv.paid_at ? " (paid " + formatDateUS(inv.paid_at) + ")" : ""}`
  );
  return `\n\nCUSTOMER INVOICES (last ${lines.length}):\n${lines.join("\n")}`;
}

// ==================== Chat Context ====================

async function getChatContext(sb: any) {
  const { data: channels } = await sb.from("chat_channels")
    .select("id, name, job_id, estimate_id, is_special")
    .order("created_at");
  if (!channels || channels.length === 0) return "";

  const { data: messages } = await sb.from("chat_messages")
    .select("channel_id, sender_name, content, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  // Get job info for job-linked channels
  const jobLinkedChannels = channels.filter((c: any) => c.job_id);
  const jobIds = jobLinkedChannels.map((c: any) => c.job_id);
  const jobMap: Record<string, any> = {};
  if (jobIds.length > 0) {
    const { data: jobs } = await sb.from("jobs")
      .select("id, hcp_job_number, customer_name, job_type, status, scheduled_date, assigned_to")
      .in("id", jobIds);
    for (const j of (jobs || [])) jobMap[j.id] = j;
  }

  const channelMap: Record<string, { name: string; job?: any; isSpecial: boolean; msgs: string[] }> = {};
  for (const ch of channels) {
    channelMap[ch.id] = { name: ch.name, job: ch.job_id ? jobMap[ch.job_id] : undefined, isSpecial: ch.is_special, msgs: [] };
  }
  for (const m of (messages || [])) {
    if (channelMap[m.channel_id] && channelMap[m.channel_id].msgs.length < 5) {
      channelMap[m.channel_id].msgs.push(`  ${m.sender_name}: "${m.content.slice(0, 100)}" (${formatDateUS(m.created_at)})`);
    }
  }

  // Separate special channels and job threads
  const specialLines: string[] = [];
  const threadLines: string[] = [];
  for (const [, ch] of Object.entries(channelMap)) {
    const msgBlock = ch.msgs.length > 0 ? "\n" + ch.msgs.join("\n") : "";
    if (ch.isSpecial || !ch.job) {
      specialLines.push(`- #${ch.name}${msgBlock}`);
    } else if (ch.job) {
      const j = ch.job;
      threadLines.push(`- #${ch.name} → Job #${j.hcp_job_number || "?"} (${j.customer_name}, ${j.job_type}, ${j.status}, sched: ${j.scheduled_date ? formatDateUS(j.scheduled_date) : "UNSCHEDULED"}, tech: ${j.assigned_to || "unassigned"})${msgBlock}`);
    }
  }

  // Get unscheduled/follow-up jobs explicitly
  const { data: followUpJobs } = await sb.from("jobs")
    .select("hcp_job_number, customer_name, job_type, status, assigned_to, created_at")
    .is("scheduled_date", null)
    .not("status", "in", '("done","invoiced","canceled")')
    .order("created_at", { ascending: false })
    .limit(20);
  
  let followUpSection = "";
  if (followUpJobs && followUpJobs.length > 0) {
    const fLines = followUpJobs.map((j: any) => 
      `- Job #${j.hcp_job_number || "?"} (${j.customer_name}) — ${j.job_type}, ${j.status}, tech: ${j.assigned_to || "unassigned"}, created: ${formatDateUS(j.created_at)}`
    );
    followUpSection = `\n\nJOBS NEEDING FOLLOW-UP (unscheduled, ${followUpJobs.length}):\n${fLines.join("\n")}`;
  }

  return `\n\nTEAM CHAT CHANNELS:\n${specialLines.join("\n")}${threadLines.length > 0 ? "\n\nACTIVE JOB THREADS (" + threadLines.length + "):\n" + threadLines.join("\n") : ""}${followUpSection}`;
}

// Phase 2: Equipment matchups context for quoting
async function getEquipmentMatchupsContext(sb: any) {
  const { data: allData } = await sb.from("equipment_matchups")
    .select("id, brand, condenser_model, coil_model, furnace_model, tonnage, seer2, hspf2, eer2, afue, system_type, application, tier, ahri_number, total_price, factory_rebate_price, early_rebate, burnout_rebate, heat_kit, cooling_cap, cps_tonnage")
    .order("brand");
  if (!allData || allData.length === 0) return "";

  // Prefer Multiposition; only include H/V when no Multiposition exists for that brand+system_type+tonnage+tier
  const multiKeys = new Set(
    allData.filter((m: any) => m.application === "Multiposition")
      .map((m: any) => `${m.brand}|${m.system_type}|${m.tonnage}|${m.tier}`)
  );
  const data = allData.filter((m: any) => {
    if (m.application === "Multiposition" || !m.application) return true;
    const key = `${m.brand}|${m.system_type}|${m.tonnage}|${m.tier}`;
    return !multiKeys.has(key); // include H/V only when no Multi exists
  });
  if (data.length === 0) return "";

  const lines = data.map((m: any) => {
    const specs = [
      m.tonnage ? `${m.tonnage}T` : null,
      m.seer2 ? `${m.seer2} SEER2` : null,
      m.eer2 ? `${m.eer2} EER2` : null,
      m.hspf2 ? `${m.hspf2} HSPF2` : null,
      m.afue ? `${m.afue}% AFUE` : null,
      m.cooling_cap ? `${m.cooling_cap} BTUh` : null,
      m.cps_tonnage ? `CPS ${m.cps_tonnage}T` : null,
    ].filter(Boolean).join(", ");
    const models = [m.condenser_model, m.coil_model, m.furnace_model].filter(Boolean).join(" + ");
    const extras = [
      m.heat_kit ? `HeatKit:${m.heat_kit}` : null,
      m.application ? `App:${m.application}` : null,
    ].filter(Boolean).join(" ");
    let priceStr = "";
    if (m.total_price != null) {
      const mo36 = m.monthly_payment ?? Math.round(m.total_price * 0.0278 * 100) / 100;
      const mo120 = m.monthly_payment_120 ?? Math.round(m.total_price * 0.0125 * 100) / 100;
      priceStr = ` — Financed:$${Math.round(m.total_price)} Mo36:$${mo36} Mo120:$${mo120} InstantRebate:$${Math.round(m.factory_rebate_price || m.total_price)}`;
    }
    const rebateStr = m.early_rebate ? ` CPS:$${m.early_rebate}/$${m.burnout_rebate}` : "";
    return `- [${m.tier || "std"}] ${m.brand} ${m.system_type || ""} ${specs} | ${models}${extras ? " " + extras : ""}${m.ahri_number ? " (AHRI: " + m.ahri_number + ")" : ""}${priceStr}${rebateStr}`;
  });
  const quoteFormat = [
    "",
    "QUOTE OUTPUT FORMAT: When presenting equipment options to the user, wrap EACH system option in :::equipment-card and ::: delimiters. Use this exact structure inside.",
    "IMPORTANT: Use ONLY the data returned from the lookup_equipment tool or the equipment matchups context above. Do NOT leave fields as 'TBD' if the data is available.",
    "",
    ":::equipment-card",
    "**{Brand} {Tier} Series – {Tonnage} Ton {SystemType}**",
    "",
    "# Specifications",
    "➡️ Orientation: {application} — Show Multi-Pos, Vertical, or Horizontal.",
    "➡️ Heat Pump/AC: {Brand} {Tier} Series – {Tonnage} Ton — Label as 'Heat Pump' for heat_pump/dual_fuel, 'AC' for ac_only/gas_heat.",
    "➡️ Air Handler/Furnace: {description} — For heat_pump/electric show 'Multi-Position Air Handler'. For gas_heat/dual_fuel show 'Gas Furnace ({afue}% AFUE)'.",
    "➡️ Heater: {heat_kit} — Show 'Electric Heat Kit (as required)' if heat_kit exists. For gas_heat show 'Gas Furnace (included above)'. Omit if null.",
    "",
    "# Models | Serials",
    "➡️ OUTDOOR – {condenser_model} | [Outdoor Serial here]",
    "➡️ INDOOR – {coil_model or furnace_model} | [Indoor Serial here]",
    "",
    "# Efficiency",
    "➡️ AHRI#: {ahri_number} — MANDATORY. Pull from matchups data. NEVER web search.",
    "➡️ SEER2: {seer2}",
    "➡️ EER2: {eer2} — Show value from data. If not available, show 'N/A'.",
    "➡️ HSPF2: {hspf2} — Only for heat_pump/dual_fuel. If not available, show 'N/A'.",
    "➡️ Cooling Capacity: {cooling_cap} BTUh",
    "",
    "# Pricing — Customer picks ONE of three OR options (mutually exclusive)",
    "➡️ 0% APR · 36 Mo: {total_price} ({monthly_payment}/mo)",
    "➡️ 9.99% APR · 120 Mo: {monthly_payment_120}/mo (Plan 943)",
    "➡️ Instant Factory Rebate: ~~{total_price}~~ **{factory_rebate_price}**",
    "➡️ CPS Rebate: -{early_rebate} → **{factory_rebate_price - early_rebate}** after rebate",
    "💡 *CPS rebates require an application and come as a bill credit — we help you through the entire process.*",
    ":::",
    "",
    "Always use this card format for equipment quotes. Never present equipment options as plain text.",
    "If a field is available in the data, you MUST show it — never use [TBD] or 'Not specified' for data that exists.",
    "⚠️ AHRI NUMBER IS MANDATORY: Every equipment card MUST include the AHRI number from the matchups data. It is in your context — NEVER search the web for it. If no AHRI exists for a combo, say 'Not in database' — do NOT web search.",
    "For the 'after rebate' line, calculate factory_rebate_price minus early_rebate. Only use the early replacement CPS rebate value — do not show burnout.",
    "",
    "EQUIPMENT PICKER: When you need to ask the user about equipment specs before building a quote, think like the technicians: Brand -> Tonnage -> System Type -> Tier -> Orientation / install location. Example: 'Carrier 3 ton Performance gas heat system in the attic.' Do NOT ask free-text questions. Instead emit an interactive picker block:",
    ':::equipment-picker',
    '{"step":"brand","options":["Goodman","Ducane","Armstrong","Carrier","Day and Night","Trane"]}',
    ':::',
    "The frontend will render this as an interactive step-by-step card. The user picks Brand -> Tonnage -> System Type -> Tier -> Orientation with buttons. Once all selections are made, a structured summary is automatically sent back. Use this picker whenever ANY equipment detail is missing for a quote.",
    "",
    "CSR INTAKE CARD: When handling a call/chat from someone NOT in the customer database, emit a :::csr-intake block to guide the CSR through new customer intake:",
    ':::csr-intake',
    '{"status":"new_customer_detected","phone":"+15550123456"}',
    ':::',
    "The frontend renders an interactive step-by-step card: Service Type → Name → Address → Phone → Email → Ownership (rental?) → Tenant Contact → Alt Contact → Create Customer. It also has a 'Send Intake Link' button that texts the customer a self-service form they can fill out on their phone with address autocomplete and auto-formatting. Use this whenever a caller is not found in the system.",
    "",
    "DISCOVERY QUESTIONS: Service technicians now have a 'Comfort Assessment' (discovery) section at the start of their form. It captures: hot/cold spots, allergies, thermostat type, smart thermostat interest, filtration setup, REME HALO interest, duct cleaning, duct sealing, insulation needs, carpentry referrals, strange noises, and problem duration. When a tech reports 'Yes' answers on these discovery fields, flag them as upsell opportunities (e.g., 'Customer interested in REME HALO — recommend IAQ add-on').",
  ].join("\n");
  return `\n\nEQUIPMENT MATCHUPS (${lines.length} systems — Multiposition preferred. For brands like Goodman/Ducane/Armstrong gas heat that only have Vertical/Horizontal, check the job's orientation field (closet=Vertical, attic=Horizontal) before quoting. If orientation is unknown, use the equipment picker.):\n${lines.join("\n")}\n\n⚠️ PRICING RULE: The prices above (Financed / Factory Rebate) are FINAL installed prices from the database. NEVER calculate, estimate, or adjust these numbers — except subtract early_rebate from factory_rebate_price for the CPS after-rebate line. Use all other values exactly as shown.\n\n🚨 QUOTE FORMAT IS NON-NEGOTIABLE: You MUST use the :::equipment-card format below for EVERY quote. NEVER output quotes as plain text paragraphs, bullet lists, or prose. NEVER approximate or round prices — use EXACT values from the matchups data. NEVER invent tiers that don't exist in the data. If only 1 or 2 matchups exist, show only those — do NOT fabricate additional options. Every field must come from the database row, not from your general knowledge.` + quoteFormat;
}

// Job-specific equipment context (what's actually assigned to each job)
async function getJobEquipmentContext(sb: any) {
  const { data } = await sb.from("job_equipment")
    .select("id, job_id, model_number, serial_number, brand, source, confidence, is_confirmed, jobs(hcp_job_number, customer_name, assigned_to, scheduled_date)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!data || data.length === 0) return "";

  const grouped: Record<string, { job: any; units: any[] }> = {};
  for (const eq of data) {
    const jobKey = eq.jobs?.hcp_job_number || eq.job_id;
    if (!grouped[jobKey]) grouped[jobKey] = { job: eq.jobs, units: [] };
    grouped[jobKey].units.push(eq);
  }

  const lines: string[] = [];
  for (const [jobKey, g] of Object.entries(grouped)) {
    const jobLabel = g.job ? `Job #${g.job.hcp_job_number} (${g.job.customer_name}, tech: ${g.job.assigned_to || "unassigned"}, sched: ${g.job.scheduled_date ? formatDateUS(g.job.scheduled_date) : "unscheduled"})` : `Job ${jobKey}`;
    const unitLines = g.units.map((u: any) =>
      `  • ${u.brand || "?"} ${u.model_number || "no model"}${u.serial_number ? " S/N: " + u.serial_number : ""} [${u.source}, ${u.confidence}${u.is_confirmed ? ", confirmed" : ""}]`
    ).join("\n");
    lines.push(`- ${jobLabel}:\n${unitLines}`);
  }
  return `\n\nJOB EQUIPMENT (actual units assigned to jobs, ${data.length} total):\n${lines.join("\n")}`;
}

// ==================== Estimate Reviews & Tech Forms Context ====================

async function getEstimateReviewsContext(sb: any) {
  const { data } = await sb.from("estimate_reviews")
    .select("id, status, selected_tiers, admin_notes, created_at, reviewed_at, reviewed_by, employee_id, employees(name), jobs(hcp_job_number, customer_name, address, job_type)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!data || data.length === 0) return "";
  const lines = data.map((r: any) => {
    const tiers = Array.isArray(r.selected_tiers) ? r.selected_tiers.join(", ") : JSON.stringify(r.selected_tiers);
    return `- [${r.status}] Job #${r.jobs?.hcp_job_number || "?"} (${r.jobs?.customer_name || "?"}) — tiers: ${tiers}, tech: ${r.employees?.name || "?"}, ${r.reviewed_by ? "reviewed by " + r.reviewed_by : "pending review"}${r.admin_notes ? " — " + r.admin_notes.slice(0, 80) : ""} (${formatDateUS(r.created_at)})`;
  });
  const pending = data.filter((r: any) => r.status === "pending_review").length;
  return `\n\nESTIMATE REVIEWS (${lines.length} total, ${pending} pending review):\n${lines.join("\n")}`;
}

async function getTechFormsContext(sb: any) {
  const { data } = await sb.from("tech_forms")
    .select("id, status, equipment_model, equipment_serial, notes, submitted_at, is_service_agreement, employees(name), jobs(hcp_job_number, customer_name)")
    .order("submitted_at", { ascending: false })
    .limit(30);
  if (!data || data.length === 0) return "";
  const lines = data.map((f: any) =>
    `- [${f.status}] Job #${f.jobs?.hcp_job_number || "?"} (${f.jobs?.customer_name || "?"}) — tech: ${f.employees?.name || "?"}, model: ${f.equipment_model || "N/A"}, serial: ${f.equipment_serial || "N/A"}${f.is_service_agreement ? " [SA]" : ""}${f.notes ? " — " + f.notes.slice(0, 80) : ""} (${f.submitted_at ? formatDateUS(f.submitted_at) : "?"})`
  );
  return `\n\nTECH FORMS (last ${lines.length}):\n${lines.join("\n")}`;
}

// ==================== Maintenance Plans & Perk Usage Context ====================

async function getMaintenancePlansContext(sb: any) {
  const { data: agreements } = await sb.from("service_agreements")
    .select("id, plan_name, plan_type, status, price, frequency, start_date, end_date, customer_id, customers(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!agreements || agreements.length === 0) return "";

  // Get perk usage summaries
  const activeIds = agreements.filter((a: any) => a.status === "active").map((a: any) => a.id);
  const perkSummaries: Record<string, { count: number; totalDiscount: number }> = {};
  if (activeIds.length > 0) {
    const { data: perks } = await sb.from("plan_perk_usage")
      .select("agreement_id, perk_type, applied_discount")
      .in("agreement_id", activeIds);
    for (const p of (perks || [])) {
      if (!perkSummaries[p.agreement_id]) perkSummaries[p.agreement_id] = { count: 0, totalDiscount: 0 };
      perkSummaries[p.agreement_id].count++;
      perkSummaries[p.agreement_id].totalDiscount += (p.applied_discount || 0);
    }
  }

  // Get visit counts
  const visitCounts: Record<string, number> = {};
  if (activeIds.length > 0) {
    const { data: visits } = await sb.from("agreement_visits")
      .select("agreement_id")
      .in("agreement_id", activeIds);
    for (const v of (visits || [])) {
      visitCounts[v.agreement_id] = (visitCounts[v.agreement_id] || 0) + 1;
    }
  }

  const active = agreements.filter((a: any) => a.status === "active");
  const expired = agreements.filter((a: any) => a.status !== "active");
  const lines = active.map((a: any) => {
    const name = [a.customers?.first_name, a.customers?.last_name].filter(Boolean).join(" ") || "Unknown";
    const perks = perkSummaries[a.id];
    const visits = visitCounts[a.id] || 0;
    return `- ${name}: ${a.plan_name} (${a.plan_type}, $${a.price}/${a.frequency}) — ${a.start_date} to ${a.end_date}, ${visits} visit(s)${perks ? `, ${perks.count} perk(s) used, $${perks.totalDiscount.toFixed(0)} saved` : ""}`;
  });
  return `\n\nMAINTENANCE PLANS (${active.length} active, ${expired.length} expired/canceled):\n${lines.join("\n")}`;
}

// ==================== Customer Equipment Context ====================

async function getCustomerEquipmentContext(sb: any) {
  const { data } = await sb.from("customer_equipment")
    .select("id, equipment_type, brand, model_number, serial_number, install_date, location_note, notes, customers(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!data || data.length === 0) return "";

  const grouped: Record<string, any[]> = {};
  for (const eq of data) {
    const name = [eq.customers?.first_name, eq.customers?.last_name].filter(Boolean).join(" ") || "Unknown";
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(eq);
  }

  const lines: string[] = [];
  for (const [name, units] of Object.entries(grouped)) {
    const unitStr = units.map((u: any) => {
      const age = u.install_date ? (() => {
        const years = Math.floor((Date.now() - new Date(u.install_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        return years >= 10 ? ` ⚠️${years}yr OLD` : ` ${years}yr`;
      })() : "";
      return `  • ${u.equipment_type}: ${u.brand || "?"} ${u.model_number || "no model"}${u.serial_number ? " S/N: " + u.serial_number : ""}${age}${u.location_note ? " @ " + u.location_note : ""}`;
    }).join("\n");
    lines.push(`- ${name}:\n${unitStr}`);
  }
  return `\n\nCUSTOMER EQUIPMENT (${data.length} units across ${Object.keys(grouped).length} customers):\n${lines.join("\n")}`;
}

// ==================== Estimates Context ====================

async function getEstimatesContext(sb: any) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data } = await sb.from("estimates")
    .select("id, estimate_number, customer_name, address, scheduled_date, assigned_to, work_status, description, options, customer_email, customer_phone, arrival_start, arrival_end")
    .gte("created_at", ninetyDaysAgo)
    .order("scheduled_date", { ascending: false })
    .limit(50);
  if (!data || data.length === 0) return "";
  const lines = data.map((e: any) => {
    const contact = [e.customer_phone, e.customer_email].filter(Boolean).join(", ");
    const arrival = e.arrival_start && e.arrival_end ? ` | arrival: ${e.arrival_start}–${e.arrival_end}` : "";
    const opts = e.options ? ` | options: ${JSON.stringify(e.options).slice(0, 120)}` : "";
    return `- Est #${e.estimate_number || "?"} | ${e.customer_name || "?"} | ${e.address || "no addr"} | ${e.work_status || "?"} | sched: ${e.scheduled_date ? formatDateUS(e.scheduled_date) : "unscheduled"} | tech: ${e.assigned_to || "unassigned"}${contact ? " | " + contact : ""}${arrival}${e.description ? " — " + e.description.slice(0, 60) : ""}${opts}`;
  });
  return `\n\nESTIMATES (last 90 days, ${lines.length}):\n${lines.join("\n")}`;
}

// ==================== Voicemails Context ====================

async function getVoicemailsContext(sb: any) {
  const { data } = await sb.from("voicemails")
    .select("id, phone_number, contact_name, contact_type, duration_seconds, transcription, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!data || data.length === 0) return "";
  const unread = data.filter((v: any) => !v.is_read).length;
  const lines = data.map((v: any) => {
    const dur = v.duration_seconds ? `${Math.floor(v.duration_seconds / 60)}m${v.duration_seconds % 60}s` : "?";
    const name = v.contact_name || v.phone_number;
    const read = v.is_read ? "" : " [UNREAD]";
    const transcript = v.transcription ? ` | "${v.transcription.slice(0, 150)}"` : "";
    return `- ${name} (${v.contact_type || "unknown"}) — ${dur}${read}${transcript} — ${formatDateUS(v.created_at)}`;
  });
  return `\n\nVOICEMAILS (${lines.length} total, ${unread} unread):\n${lines.join("\n")}`;
}

// ==================== Warranty Registrations Context ====================

async function getWarrantyContext(sb: any) {
  const { data } = await sb.from("warranty_registrations")
    .select("id, status, registered_at, confirmation_number, notes, created_at, job_id, jobs(hcp_job_number, customer_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!data || data.length === 0) return "";
  const lines = data.map((w: any) =>
    `- [${w.status}] Job #${w.jobs?.hcp_job_number || "?"} (${w.jobs?.customer_name || "?"}) — conf: ${w.confirmation_number || "pending"}${w.registered_at ? " reg: " + formatDateUS(w.registered_at) : ""}${w.notes ? " — " + w.notes.slice(0, 80) : ""}`
  );
  const pending = data.filter((w: any) => w.status === "pending").length;
  return `\n\nWARRANTY REGISTRATIONS (${lines.length} total, ${pending} pending):\n${lines.join("\n")}`;
}

// ==================== Quotes Context ====================

async function getQuotesContext(sb: any) {
  const { data: quotes } = await sb.from("quotes")
    .select("id, customer_name, address, tonnage, system_type, brand, application, status, notes, created_at, estimate_id, job_id")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!quotes || quotes.length === 0) return "";

  const quoteIds = quotes.map((q: any) => q.id);
  const { data: options } = await sb.from("quote_options")
    .select("quote_id, tier, matchup_id, price_override, is_selected, notes, equipment_matchups(brand, condenser_model, total_price, seer2)")
    .in("quote_id", quoteIds);

  const optionMap: Record<string, any[]> = {};
  for (const o of (options || [])) {
    if (!optionMap[o.quote_id]) optionMap[o.quote_id] = [];
    optionMap[o.quote_id].push(o);
  }

  const lines = quotes.map((q: any) => {
    const opts = (optionMap[q.id] || []).map((o: any) => {
      const m = o.equipment_matchups;
      const price = o.price_override || m?.total_price || "?";
      return `${o.tier}: ${m?.brand || "?"} ${m?.condenser_model || "?"} $${price}${o.is_selected ? " ✓" : ""}`;
    }).join(", ");
    return `- ${q.customer_name} | ${q.tonnage}T ${q.system_type} ${q.brand || ""} | ${q.status} | ${opts || "no options"}${q.notes ? " — " + q.notes.slice(0, 60) : ""} (${formatDateUS(q.created_at)})`;
  });
  return `\n\nQUOTES (${lines.length}):\n${lines.join("\n")}`;
}

// ==================== Referrals Context ====================

async function getReferralsContext(sb: any) {
  const { data: codes } = await sb.from("referral_codes")
    .select("id, code, bonus_type, is_active, customer_id, customers(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  const { data: referrals } = await sb.from("referrals")
    .select("id, referrer_code, referred_name, referred_phone, service_needed, status, bonus_awarded, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if ((!codes || codes.length === 0) && (!referrals || referrals.length === 0)) return "";

  let result = "";
  if (codes && codes.length > 0) {
    const codeLines = codes.map((c: any) => {
      const name = [c.customers?.first_name, c.customers?.last_name].filter(Boolean).join(" ") || "Unknown";
      return `- ${name}: code "${c.code}" (${c.bonus_type}, ${c.is_active ? "active" : "inactive"})`;
    });
    result += `\n\nREFERRAL CODES (${codeLines.length}):\n${codeLines.join("\n")}`;
  }
  if (referrals && referrals.length > 0) {
    const refLines = referrals.map((r: any) =>
      `- ${r.referred_name || "?"} (${r.referred_phone || "?"}) via code "${r.referrer_code}" — ${r.status}${r.bonus_awarded ? " ✅ bonus awarded" : ""}${r.service_needed ? " — " + r.service_needed.slice(0, 60) : ""} (${formatDateUS(r.created_at)})`
    );
    result += `\n\nREFERRALS (${refLines.length}):\n${refLines.join("\n")}`;
  }
  return result;
}

// ==================== Property Data Context ====================

async function getPropertyDataContext(sb: any) {
  const { data } = await sb.from("property_data")
    .select("address, bedrooms, bathrooms, sqft, year_built, estimated_value, lot_size, property_type")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!data || data.length === 0) return "";
  const lines = data.map((p: any) => {
    const specs = [p.sqft ? `${p.sqft} sqft` : null, p.bedrooms ? `${p.bedrooms}bd` : null, p.bathrooms ? `${p.bathrooms}ba` : null, p.year_built ? `built ${p.year_built}` : null, p.lot_size || null].filter(Boolean).join(", ");
    return `- ${p.address || "?"} | ${p.property_type || "?"} | ${specs}${p.estimated_value ? " | ~$" + Number(p.estimated_value).toLocaleString() : ""}`;
  });
  return `\n\nPROPERTY DATA (${lines.length} properties):\n${lines.join("\n")}`;
}

async function getActionItemsContext(sb: any) {
  const { data } = await sb.from("action_items")
    .select("id, title, description, category, priority, status, source, job_id, suggested_action, created_at, jobs(hcp_job_number, customer_name)")
    .in("status", ["pending", "new"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (!data || data.length === 0) return "";
  const lines = data.map((a: any) =>
    `- [${a.priority}] ${a.category}: "${a.title}"${a.description ? " — " + a.description.slice(0, 100) : ""} | Job #${a.jobs?.hcp_job_number || "N/A"} | action: ${a.suggested_action || "none"} (${formatDateUS(a.created_at)})`
  );
  return `\n\nACTION ITEMS (${lines.length} pending — YOUR decision queue):\n${lines.join("\n")}`;
}

async function getJobRemindersContext(sb: any) {
  const fortyEightHoursFromNow = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data } = await sb.from("job_reminders")
    .select("id, reminder_type, status, scheduled_for, sent_at, job_id, jobs(hcp_job_number, customer_name)")
    .eq("status", "pending")
    .lte("scheduled_for", fortyEightHoursFromNow)
    .order("scheduled_for")
    .limit(30);
  if (!data || data.length === 0) return "";
  const lines = data.map((r: any) =>
    `- ${r.reminder_type} for Job #${r.jobs?.hcp_job_number || "?"} (${r.jobs?.customer_name || "?"}) — scheduled: ${formatDateUS(r.scheduled_for)} [${r.status}]`
  );
  return `\n\nPENDING REMINDERS (next 48h, ${lines.length}):\n${lines.join("\n")}`;
}

async function getOutboundDraftsContext(sb: any) {
  const { data } = await sb.from("outbound_drafts")
    .select("id, channel, recipient, subject, body, status, source, created_at, job_id, jobs(hcp_job_number, customer_name)")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data || data.length === 0) return "";
  const lines = data.map((d: any) =>
    `- [${d.channel}] To: ${d.recipient} | "${d.subject || d.body?.slice(0, 60) || "?"}" | source: ${d.source} | Job #${d.jobs?.hcp_job_number || "N/A"} (${formatDateUS(d.created_at)})`
  );
  return `\n\nOUTBOUND DRAFTS PENDING APPROVAL (${lines.length}):\n${lines.join("\n")}`;
}

// (Todos context removed — JARVIS no longer manages a To-Do list.)
async function getTodosContext(_sb: any) { return ""; }

// ==================== AHRI Lookups Context ====================

async function getAhriLookupsContext(sb: any) {
  const { data } = await sb.from("ahri_lookups")
    .select("ahri_number, outdoor_brand, outdoor_model, indoor_model, furnace_model, seer2, hspf2, eer2, cooling_cap_btuh, energy_star, refrigerant, program_type, model_status")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!data || data.length === 0) return "";
  const lines = data.map((a: any) => {
    const specs = [a.seer2 ? `${a.seer2} SEER2` : null, a.hspf2 ? `${a.hspf2} HSPF2` : null, a.eer2 ? `${a.eer2} EER2` : null].filter(Boolean).join(", ");
    const models = [a.outdoor_model, a.indoor_model, a.furnace_model].filter(Boolean).join(" + ");
    return `- AHRI ${a.ahri_number}: ${a.outdoor_brand || "?"} ${models} | ${specs}${a.energy_star ? " ⭐ES" : ""}${a.cooling_cap_btuh ? " " + a.cooling_cap_btuh + "BTU" : ""} [${a.model_status || "?"}]`;
  });
  return `\n\nAHRI LOOKUPS (${lines.length} cached certificates):\n${lines.join("\n")}`;
}

function buildTaskSummary(ctx: any) {
  const activeJobs = ctx.allJobs || [];
  const overdueJobs = activeJobs.filter((j: any) => j.scheduled_date && j.scheduled_date < ctx.today && j.status !== "done");
  const todayJobs = activeJobs.filter((j: any) => j.scheduled_date === ctx.today);
  return `TODAY: ${formatDateUS(ctx.today)}

ACTIVE JOBS: ${activeJobs.length}
OVERDUE JOBS (past scheduled date, still active): ${overdueJobs.length}
${overdueJobs.map((j: any) => `- Job #${j.hcp_job_number} (${j.customer_name}) scheduled ${formatDateUS(j.scheduled_date)} — ${j.status}, tech: ${j.assigned_to || "unassigned"}`).join("\n")}

TODAY'S JOBS: ${todayJobs.length}
${todayJobs.map((j: any) => `- Job #${j.hcp_job_number} (${j.customer_name}) — ${j.status}, tech: ${j.assigned_to || "unassigned"}`).join("\n")}

Job progression is tracked via the Workflow Action Bar (timestamps on job records), NOT via tasks.`;
}

// ==================== Direct Tool Definitions ====================
// Collapsed from specialist agents into orchestrator for zero-hop execution.
// Only repair_quote, supplyhouse, carrier_enterprise, invoicing remain as separate edge functions.

const lookupEquipmentTool = { type: "function", function: { name: "lookup_equipment", description: "Search equipment matchups by specs.", parameters: { type: "object", properties: { tonnage: { type: "number" }, brand: { type: "string" }, system_type: { type: "string" }, tier: { type: "string" }, min_seer2: { type: "number" } }, additionalProperties: false } } };
const verifyAddressTool = { type: "function", function: { name: "verify_address", description: "Verify and correct a street address using Google geocoding. Use BEFORE saving any customer/job/estimate.", parameters: { type: "object", properties: { address: { type: "string", description: "Full address to verify" } }, required: ["address"], additionalProperties: false } } };

// Communications (formerly communications-agent)
const sendSmsToEmployeeTool = { type: "function", function: { name: "send_sms_to_employee", description: "Send an SMS to a team member by name.", parameters: { type: "object", properties: { employee_name: { type: "string" }, message: { type: "string" } }, required: ["employee_name", "message"], additionalProperties: false } } };
const sendTechFormLinkTool = { type: "function", function: { name: "send_tech_form_link", description: "Send a tech form link to the assigned tech for a job.", parameters: { type: "object", properties: { job_identifier: { type: "string" }, custom_message: { type: "string" } }, required: ["job_identifier"], additionalProperties: false } } };
const searchSmsHistoryTool = { type: "function", function: { name: "search_sms_history", description: "Search SMS history by phone, name, or message text.", parameters: { type: "object", properties: { query: { type: "string" }, direction: { type: "string", enum: ["inbound", "outbound"] }, limit: { type: "number" } }, required: ["query"], additionalProperties: false } } };
const searchCallHistoryTool = { type: "function", function: { name: "search_call_history", description: "Search call log by phone or contact name.", parameters: { type: "object", properties: { query: { type: "string" }, direction: { type: "string", enum: ["inbound", "outbound"] }, status: { type: "string" }, limit: { type: "number" } }, required: ["query"], additionalProperties: false } } };
const readChatMessagesTool = { type: "function", function: { name: "read_chat_messages", description: "Read recent team chat messages, optionally by channel.", parameters: { type: "object", properties: { channel_name: { type: "string" }, limit: { type: "number" } }, additionalProperties: false } } };
const sendChatMessageTool = { type: "function", function: { name: "send_chat_message", description: "Send a message to a team chat channel as Copilot.", parameters: { type: "object", properties: { channel_name: { type: "string" }, message: { type: "string" } }, required: ["channel_name", "message"], additionalProperties: false } } };

// Sales docs (formerly sales-docs-agent)
const createQuoteTool = { type: "function", function: { name: "create_quote", description: "Create a database-backed equipment quote and return render-ready :::equipment-card blocks using exact matchup values only. Think in technician order: brand, tonnage, system type, tier, orientation/application.", parameters: { type: "object", properties: { customer_name: { type: "string" }, tonnage: { type: "number" }, system_type: { type: "string" }, brand: { type: "string" }, tier: { type: "string" }, address: { type: "string" }, application: { type: "string" }, job_id: { type: "string" }, estimate_id: { type: "string" }, notes: { type: "string" } }, required: ["customer_name", "tonnage", "system_type"], additionalProperties: false } } };
const generateInstallQuoteTool = { type: "function", function: { name: "generate_install_quote", description: "Generate the FULL long-form HVAC install quote for a technician-style selection: brand + tonnage + system_type + optional tier + attic/closet orientation. Returns the complete description text plus cash and financed prices. Use whenever the user asks for an install quote/system quote or says something like 'Carrier 3 ton Performance gas heat in the attic'. Returns a clear error if no matchup exists.", parameters: { type: "object", properties: { brand: { type: "string" }, tonnage: { type: "number" }, system_type: { type: "string", description: "heat_pump | gas_heat | electric | dual_fuel" }, tier: { type: "string" }, location: { type: "string", description: "Attic or Closet — picks Multiposition with orientation fallback" } }, required: ["brand", "tonnage", "system_type"], additionalProperties: false } } };
const convertEstimateToJobTool = { type: "function", function: { name: "convert_estimate_to_job", description: "Convert an approved estimate into a new job on the dispatch board.", parameters: { type: "object", properties: { estimate_review_id: { type: "string" }, customer_name: { type: "string" }, scheduled_date: { type: "string" }, assigned_to: { type: "string" } }, additionalProperties: false } } };
const generateLetterheadTool = { type: "function", function: { name: "generate_letterhead_document", description: "Generate a company letterhead document.", parameters: { type: "object", properties: { document_type: { type: "string" }, recipient_name: { type: "string" }, recipient_address: { type: "string" }, employee_name: { type: "string" }, body_text: { type: "string" } }, required: ["document_type", "recipient_name", "body_text"], additionalProperties: false } } };

// Scheduling (formerly scheduling-agent)
const getTravelTimesTool = { type: "function", function: { name: "get_travel_times", description: "Calculate travel times between a tech's jobs on a given date.", parameters: { type: "object", properties: { tech_name: { type: "string" }, date: { type: "string" } }, required: ["tech_name", "date"], additionalProperties: false } } };
const checkSchedulingFitTool = { type: "function", function: { name: "check_scheduling_fit", description: "Check if a proposed address fits into a tech's existing route.", parameters: { type: "object", properties: { tech_name: { type: "string" }, date: { type: "string" }, proposed_address: { type: "string" } }, required: ["tech_name", "date", "proposed_address"], additionalProperties: false } } };
const suggestScheduleOptimizationTool = { type: "function", function: { name: "suggest_schedule_optimization", description: "Analyze the next 3 days and suggest scheduling optimizations.", parameters: { type: "object", properties: {}, additionalProperties: false } } };

// Customer CRM (formerly customer-actions)
const searchCustomerTool = { type: "function", function: { name: "search_customer", description: "Search the CRM for an existing customer by name, phone, or email. ALWAYS use this BEFORE create_customer to avoid duplicates. Returns matching customers with their full details including address.", parameters: { type: "object", properties: { name: { type: "string", description: "Full or partial name to search (e.g. 'Marcus Scott' or 'Scott')" }, phone: { type: "string", description: "Phone number to search" }, email: { type: "string", description: "Email to search" } }, additionalProperties: false } } };
const createCustomerTool = { type: "function", function: { name: "create_customer", description: "Create a new customer record. ALWAYS search_customer first with BOTH name AND address to check for duplicates — address is the #1 dedup key since customers don't change addresses. ALWAYS verify_address first, then use the returned street/city/state/zip fields (NOT the full standardized string) for the address, city, state, zip parameters. If search_customer finds a match at the same address, USE the existing record — do NOT create a new one.", parameters: { type: "object", properties: { first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, address: { type: "string", description: "Street only (e.g. '292 Cimarron Dr'). Use the 'street' field from verify_address." }, city: { type: "string" }, state: { type: "string" }, zip: { type: "string" }, notes: { type: "string" } }, required: ["first_name", "last_name"], additionalProperties: false } } };
const updateCustomerTool = { type: "function", function: { name: "update_customer", description: "Update an existing UltraOffice customer record. Use this when a customer provides a new phone, email, address, or note. By default, when changing 'phone' (main number), the OLD phone value is automatically preserved as 'mobile_phone' so nothing is lost — set preserve_old_phone=false to overwrite without preserving. ALWAYS confirm with dispatcher before calling (Verify Before Write).", parameters: { type: "object", properties: { customer_id: { type: "string", description: "UUID of the customer to update (from search_customer)." }, first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string", description: "New main/home phone number." }, mobile_phone: { type: "string", description: "New mobile/cell phone number." }, email: { type: "string" }, address: { type: "string", description: "Street only." }, city: { type: "string" }, state: { type: "string" }, zip: { type: "string" }, notes: { type: "string", description: "Replaces existing notes — pass appended text if you want to keep prior notes." }, preserve_old_phone: { type: "boolean", description: "When changing phone, also save the OLD phone value as mobile_phone. Default true." } }, required: ["customer_id"], additionalProperties: false } } };

// Vendor VRM tools
// create_job tool is built dynamically at runtime with employee names — see buildCreateJobTool()
function buildCreateJobTool(employeeNames: string[]) {
  const empHint = employeeNames.length > 0 ? ` Active team members: ${employeeNames.join(", ")}.` : "";
  return { type: "function", function: { name: "create_job", description: `Propose a new job/appointment for dispatcher approval. This does NOT create the job directly — it surfaces an approval card in Mission Control. The dispatcher must confirm before the job is booked. ALWAYS include assigned_to and scheduled_date/scheduled_time when the user specifies them. Use job_type "phone_call" for callbacks, scheduled calls, and phone consultations.${empHint}`, parameters: { type: "object", properties: { customer_id: { type: "string" }, customer_name: { type: "string" }, description: { type: "string" }, job_type: { type: "string", enum: ["service", "install", "estimate", "maintenance", "phone_call"] }, address: { type: "string" }, scheduled_date: { type: "string", description: "YYYY-MM-DD format" }, scheduled_time: { type: "string", description: "HH:MM 24h format e.g. 12:00" }, assigned_to: { type: "string", description: `Employee name to assign.${empHint}` }, customer_phone: { type: "string" }, customer_email: { type: "string" } }, required: ["customer_name", "job_type"], additionalProperties: false } } };
}

// Remaining specialists (still separate edge functions, called via direct invoke)
const invokeRepairQuoteTool = { type: "function", function: { name: "invoke_repair_quote", description: "Generate a tiered service repair quote with margin targeting.", parameters: { type: "object", properties: { job_id: { type: "string" }, target_margin: { type: "number" } }, required: ["job_id"], additionalProperties: false } } };
const invokeSupplyhouseTool = { type: "function", function: { name: "invoke_supplyhouse", description: "PRIORITY TOOL for parts pricing & availability. Searches YOUR SupplyHouse.com contractor account for real wholesale pricing. Use this FIRST for ANY parts question (capacitors, contactors, fan motors, refrigerant, copper, fittings, filters). Do NOT use web_search for parts pricing.", parameters: { type: "object", properties: { action: { type: "string", enum: ["search", "add_to_cart", "text_support"] }, query: { type: "string" }, product_url: { type: "string" }, message: { type: "string" } }, required: ["action"], additionalProperties: false } } };
const invokeCarrierEnterpriseTool = { type: "function", function: { name: "invoke_carrier_enterprise", description: "PRIORITY TOOL for Carrier/Bryant/Payne OEM parts, equipment, compressors, coils. Searches YOUR Carrier Enterprise contractor account for real wholesale pricing and order history. Use this FIRST for any Carrier-brand parts question. Actions: search, add_to_cart, check_pricing, fetch_orders, fetch_order_detail, import_orders, analyze_patterns, get_suggestions.", parameters: { type: "object", properties: { action: { type: "string" }, query: { type: "string" }, product_url: { type: "string" }, job_id: { type: "string" }, job_type: { type: "string" }, system_type: { type: "string" }, orientation: { type: "string" }, order_number: { type: "string" } }, required: ["action"], additionalProperties: false } } };
const invokeInvoicingTool = { type: "function", function: { name: "invoke_invoicing", description: "Create invoices and generate payment links.", parameters: { type: "object", properties: { action: { type: "string", enum: ["create_invoice", "generate_payment_link"] }, job_id: { type: "string" }, invoice_id: { type: "string" }, include_line_items: { type: "boolean" } }, required: ["action"], additionalProperties: false } } };

// Operational job tools
const updateJobFieldTool = { type: "function", function: { name: "update_job_field", description: "Update a field on a job record. Use for timestamps (permit, inspection, warranty, etc.), status changes, scheduled_date, assigned_to, and arrival_start/arrival_end (ISO timestamps for appointment window). When a customer agrees to a specific time, update arrival_start and arrival_end accordingly.", parameters: { type: "object", properties: { job_id: { type: "string" }, field_name: { type: "string", description: "Field to update (e.g. permit_pulled_at, status, scheduled_date, arrival_start, arrival_end)" }, value: { type: "string", description: "Value to set. For arrival_start/arrival_end use full ISO timestamp e.g. '2026-03-30T13:00:00-05:00'. Defaults to current timestamp for *_at fields." } }, required: ["job_id", "field_name"], additionalProperties: false } } };
const createPartsOrderTool = { type: "function", function: { name: "create_parts_order", description: "Create a parts/equipment order for a job.", parameters: { type: "object", properties: { job_id: { type: "string" }, description: { type: "string" }, supply_house_id: { type: "string" }, po_number: { type: "string" }, expected_arrival: { type: "string" }, notes: { type: "string" } }, required: ["job_id"], additionalProperties: false } } };
const updateWarrantyStatusTool = { type: "function", function: { name: "update_warranty_status", description: "Update warranty registration status for a job.", parameters: { type: "object", properties: { job_id: { type: "string" }, status: { type: "string", enum: ["registered", "pending", "denied"] }, confirmation_number: { type: "string" }, notes: { type: "string" } }, required: ["job_id", "status"], additionalProperties: false } } };
// Live transcript retrieval (for active calls)
const getLiveTranscriptTool = { type: "function", function: { name: "get_live_transcript", description: "Retrieve the live transcript of an active phone call by its Twilio SID. Use when you need to re-read what was said during the current call. The twilio_sid is provided in the page context when a call is active.", parameters: { type: "object", properties: { twilio_sid: { type: "string", description: "The Twilio Call SID to retrieve transcript for" } }, required: ["twilio_sid"], additionalProperties: false } } };

// Smart Action Buttons — structured dispatcher workflow
const suggestActionsTool = {
  type: "function",
  function: {
    name: "suggest_actions",
    description: "When you detect actionable intent (booking, customer creation) from a call transcript, SMS thread, or dispatcher request, call this tool to present structured action buttons. DO NOT book jobs or create customers directly — always use this tool to surface action buttons for the dispatcher to click. Each action becomes a clickable button in the chat UI. For yes/no questions, use confirm/confirm_no types with a payload that will be sent as the user's reply when clicked.",
    parameters: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["book_job", "book_estimate", "book_maintenance", "create_customer", "linked_property_proposal", "select_property", "call_back", "send_text", "reply_sms", "send_invoice_reminder", "view_job", "view_voicemail", "confirm", "confirm_no"], description: "Type of action button. Use 'linked_property_proposal' when a known customer is calling about a NEW property NOT on file. Use 'select_property' when a known customer has 2+ properties on file (primary + rentals) and dispatcher needs to pick which one — pass property_options[] sourced from contact.known_addresses." },
              job_type: { type: "string", enum: ["service", "install", "estimate", "maintenance", "phone_call"], description: "For booking actions, the job type" },
              customer_name: { type: "string" },
              customer_id: { type: "string", description: "UUID if an existing customer was matched" },
              phone: { type: "string" },
              address: { type: "string" },
              description: { type: "string", description: "Brief description of the service needed" },
              email: { type: "string" },
              payload: { type: "string", description: "For confirm/confirm_no: the text to send as a user message when clicked" },
              label: { type: "string", description: "Custom button label" },
              job_id: { type: "string", description: "For view_job/send_invoice_reminder: the job UUID" },
              parent_customer_id: { type: "string", description: "For linked_property_proposal / select_property: UUID of the caller (parent contact)." },
              proposed_label: { type: "string", description: "For linked_property_proposal: short property name/label." },
              relationship: { type: "string", enum: ["church", "rental", "parents", "business", "other"], description: "For linked_property_proposal: relationship to caller." },
              property_options: {
                type: "array",
                description: "For select_property: known properties on this customer (from contact.known_addresses).",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    formatted: { type: "string" },
                  },
                  required: ["label", "formatted"],
                },
              },
            },
            required: ["type"],
            additionalProperties: false,
          },
        },
      },
      required: ["actions"],
      additionalProperties: false,
    },
  },
};

// Photo management tools
const movePhotosToJobTool = { type: "function", function: { name: "move_photos_to_job", description: "Copy MMS photo attachments from SMS messages to a job or estimate record. Use when a tech sends photos via text that need to be attached to a specific job.", parameters: { type: "object", properties: { sms_ids: { type: "array", items: { type: "string" }, description: "UUIDs of sms_log rows containing the photos" }, target_job_id: { type: "string", description: "UUID of the job to attach photos to" }, target_estimate_id: { type: "string", description: "UUID of the estimate to attach photos to (will look up linked job)" }, customer_name: { type: "string", description: "Customer name for logging context" } }, required: ["sms_ids"], additionalProperties: false } } };

// To-Do tools
const createTodoTool = { type: "function", function: { name: "create_todo", description: "[DEPRECATED — no-op]", parameters: { type: "object", properties: {}, additionalProperties: false } } };
const completeTodoTool = { type: "function", function: { name: "complete_todo", description: "[DEPRECATED — no-op]", parameters: { type: "object", properties: {}, additionalProperties: false } } };

const webSearchTool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for regulations, building codes, general knowledge, competitor research, or external info. Do NOT use for parts pricing or availability — use invoke_supplyhouse or invoke_carrier_enterprise instead.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const scrapeUrlTool = {
  type: "function",
  function: {
    name: "scrape_url",
    description: "Scrape a specific URL and return its content as markdown. Use when the user provides a URL or when you need to read a specific webpage.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to scrape" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

const updateInstructionTool = {
  type: "function",
  function: {
    name: "update_instruction",
    description: "Append a new rule or note to an existing agent instruction by its slug. Use when the user teaches you something new or corrects your behavior.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The instruction slug to update" },
        append_text: { type: "string", description: "The text to append as a new bullet point" },
      },
      required: ["slug", "append_text"],
      additionalProperties: false,
    },
  },
};

const logLearningTool = {
  type: "function",
  function: {
    name: "log_learning",
    description: "Log a correction or learning for future reference. Use when the user corrects you or you discover something important.",
    parameters: {
      type: "object",
      properties: {
        trigger: { type: "string", description: "What triggered this learning (the situation or mistake)" },
        correction: { type: "string", description: "The correct behavior or information" },
        instruction_slug: { type: "string", description: "Optional: link to an instruction slug" },
      },
      required: ["trigger", "correction"],
      additionalProperties: false,
    },
  },
};

// parseCustomerSMS moved to customer-actions edge function

async function firecrawlSearch(query: string, firecrawlKey: string) {
  const res = await fc2Search(query, { limit: 5, scrapeOptions: { formats: ["markdown"] } }, firecrawlKey);
  if (!res.success) throw new Error("Search failed");
  return res.results.map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    description: r.description || "",
    content: (r.markdown || "").substring(0, 2000),
  }));
}

async function firecrawlScrape(url: string, firecrawlKey: string) {
  const res = await fc2Scrape(url, { formats: ["markdown"], onlyMainContent: true }, firecrawlKey);
  if (!res.success) throw new Error("Scrape failed");
  return { title: res.metadata?.title || "", url, content: res.markdown.substring(0, 8000) };
}

// ==================== Extracted Tool Executor ====================
// Gateway rule: every mutating JARVIS tool must create a pending
// jarvis_action_approval action_item first. Only mode="approved_action"
// may replay the tool with the saved approval token.
// All collapsed agent logic lives here now — zero-hop execution.

const JARVIS_HITL_MUTATING_TOOLS = new Set([
  "update_instruction",
  "log_learning",
  "send_sms_to_employee",
  "send_tech_form_link",
  "send_chat_message",
  "create_customer",
  "update_customer",
  "create_job",
  "update_job_field",
  "create_quote",
  "generate_install_quote",
  "convert_estimate_to_job",
  "generate_letterhead_document",
  "invoke_repair_quote",
  "invoke_supplyhouse",
  "invoke_carrier_enterprise",
  "invoke_invoicing",
  "create_parts_order",
  "update_warranty_status",
  "create_todo",
  "complete_todo",
  "move_photos_to_job",
]);

const JARVIS_HITL_TOOL_LABELS: Record<string, string> = {
  update_instruction: "Update JARVIS instruction",
  log_learning: "Save JARVIS learning",
  send_sms_to_employee: "Send SMS to employee",
  send_tech_form_link: "Send tech form link",
  send_chat_message: "Send team chat message",
  create_customer: "Create customer",
  update_customer: "Update customer",
  create_job: "Create job",
  update_job_field: "Update job",
  create_quote: "Create quote",
  generate_install_quote: "Generate install quote",
  convert_estimate_to_job: "Convert estimate to job",
  generate_letterhead_document: "Generate document",
  invoke_repair_quote: "Generate repair quote",
  invoke_supplyhouse: "Use SupplyHouse account",
  invoke_carrier_enterprise: "Use Carrier Enterprise account",
  invoke_invoicing: "Create invoice/payment action",
  create_parts_order: "Create parts order",
  update_warranty_status: "Update warranty status",
  create_todo: "Create task",
  complete_todo: "Complete task",
  move_photos_to_job: "Move SMS photos to job",
};

function summarizeJarvisApprovalArgs(toolName: string, args: any): string {
  const parts: string[] = [];
  if (args.customer_name) parts.push(`Customer: ${args.customer_name}`);
  if (args.first_name || args.last_name) parts.push(`Customer: ${[args.first_name, args.last_name].filter(Boolean).join(" ")}`);
  if (args.customer_id) parts.push(`Customer ID: ${args.customer_id}`);
  if (args.job_id) parts.push(`Job ID: ${args.job_id}`);
  if (args.estimate_id || args.estimate_review_id) parts.push(`Estimate: ${args.estimate_id || args.estimate_review_id}`);
  if (args.field_name) parts.push(`Field: ${args.field_name} = ${args.value ?? "(now)"}`);
  if (args.customer_email) parts.push(`Email: ${args.customer_email}`);
  if (args.action) parts.push(`Action: ${args.action}`);
  if (args.employee_name) parts.push(`Employee: ${args.employee_name}`);
  if (args.channel_name) parts.push(`Channel: ${args.channel_name}`);
  if (args.message) parts.push(`Message: ${String(args.message).slice(0, 180)}`);
  if (args.custom_message) parts.push(`Message: ${String(args.custom_message).slice(0, 180)}`);
  if (toolName === "create_quote") {
    parts.push(`System: ${[args.brand, args.tonnage ? `${args.tonnage} ton` : null, args.system_type].filter(Boolean).join(" ") || "Not specified"}`);
  }
  return parts.filter(Boolean).slice(0, 6).join("\n") || JSON.stringify(args).slice(0, 500);
}

function isApprovedJarvisToolCall(toolName: string, args: any, approvedAction?: any) {
  if (!approvedAction?.metadata) return false;
  const metadata = approvedAction.metadata;
  return (
    metadata.tool_name === toolName &&
    metadata.approval_token &&
    approvedAction.token === metadata.approval_token &&
    JSON.stringify(metadata.tool_args || {}) === JSON.stringify(args || {})
  );
}

async function queueJarvisToolApproval(sb: any, toolName: string, args: any) {
  const approvalToken = crypto.randomUUID();
  const label = JARVIS_HITL_TOOL_LABELS[toolName] || toolName;
  const description = summarizeJarvisApprovalArgs(toolName, args);
  const { data, error } = await sb.from("action_items").insert({
    title: `Review JARVIS action: ${label}`,
    description,
    category: "jarvis_action_approval",
    priority: toolName === "invoke_invoicing" ? "high" : "normal",
    status: "pending",
    source: "jarvis",
    customer_phone: args.customer_phone || args.phone || null,
    job_id: args.job_id || null,
    suggested_action: "Review and approve this JARVIS action before it changes customer-facing records.",
    metadata: {
      tool_name: toolName,
      tool_args: args || {},
      approval_token: approvalToken,
      approval_required: true,
      approval_gateway: "jarvis-action-gateway",
      editable_message_field: args?.message ? "message" : args?.custom_message ? "custom_message" : null,
    },
    facts: {
      who: args.customer_name || args.first_name || args.last_name
        ? { label: args.customer_name || [args.first_name, args.last_name].filter(Boolean).join(" "), customer_id: args.customer_id || undefined, phone: args.customer_phone || args.phone || undefined }
        : undefined,
      what: { label, category: "jarvis_action_approval" },
      where: args.address ? { label: "Service address", address: args.address } : undefined,
      why: { label: "JARVIS requested a mutating action", source: "hitl_guard" },
    },
  }).select("id").single();
  if (error) throw error;
  return {
    status: "pending_approval",
    tool: toolName,
    action_item_id: data.id,
    approval_gateway: "jarvis-action-gateway",
    message: `${label} is waiting for dispatcher approval. No customer-facing records were changed.`,
  };
}

async function executeToolCall(
  toolName: string,
  args: any,
  sb: any,
  supabaseUrl: string,
  supabaseKey: string,
  openaiApiKey: string | undefined,
  req: Request,
  approvedAction?: any
): Promise<any> {
  let result: any = { status: "skipped" };
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

  // Helper to load employees (used by multiple tools)
  async function getActiveEmployees() {
    const { data } = await sb.from("employees").select("id, name, role, phone, is_active");
    return ((data || []) as any[]).filter((e: any) => e.is_active);
  }

  // Helper to invoke a specialist edge function directly
  async function invokeSpecialist(functionName: string, body: any, headers: Record<string, string> = {}) {
    const resp = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`${functionName} returned ${resp.status}: ${errText}`);
    }
    return resp.json();
  }

  try {
    if (JARVIS_HITL_MUTATING_TOOLS.has(toolName) && !isApprovedJarvisToolCall(toolName, args, approvedAction)) {
      return await queueJarvisToolApproval(sb, toolName, args);
    }

    // ═══════ Equipment ═══════
    if (toolName === "lookup_equipment") {
      let query = sb.from("equipment_matchups").select("*").order("brand");
      if (args.application) query = query.ilike("application", `%${args.application}%`);
      if (args.tonnage) query = query.eq("tonnage", args.tonnage);
      if (args.brand) query = query.ilike("brand", `%${args.brand}%`);
      if (args.system_type) query = query.ilike("system_type", `%${args.system_type}%`);
      if (args.tier) query = query.ilike("tier", `%${args.tier}%`);
      if (args.min_seer2) query = query.gte("seer2", args.min_seer2);
      const { data: allMatchups, error } = await query;
      if (error) throw error;
      const multiKeys = new Set((allMatchups || []).filter((m: any) => m.application === "Multiposition").map((m: any) => `${m.brand}|${m.system_type}|${m.tonnage}|${m.tier}`));
      const matchups = !args.application ? (allMatchups || []).filter((m: any) => {
        if (m.application === "Multiposition" || !m.application) return true;
        return !multiKeys.has(`${m.brand}|${m.system_type}|${m.tonnage}|${m.tier}`);
      }) : (allMatchups || []);
      result = { status: "success", count: matchups.length, matchups: matchups.map((m: any) => ({
        id: m.id, brand: m.brand, condenser: m.condenser_model, coil: m.coil_model, furnace: m.furnace_model, heat_kit: m.heat_kit, tonnage: m.tonnage, seer2: m.seer2, eer2: m.eer2, hspf2: m.hspf2, afue: m.afue, cooling_cap: m.cooling_cap, cps_tonnage: m.cps_tonnage, system_type: m.system_type, application: m.application, tier: m.tier, ahri_number: m.ahri_number,
        instant_rebate_price: m.factory_rebate_price, financed: m.total_price,
        monthly_payment_36: m.monthly_payment, monthly_payment_120: m.monthly_payment_120,
        component_price: m.component_price, early_rebate: m.early_rebate, burnout_rebate: m.burnout_rebate,
      })) };

    // ═══════ Web search / scrape ═══════
    } else if (toolName === "web_search") {
      if (!firecrawlKey) throw new Error("Firecrawl not configured");
      result = { status: "success", query: args.query, results: await firecrawlSearch(args.query, firecrawlKey) };
    } else if (toolName === "scrape_url") {
      if (!firecrawlKey) throw new Error("Firecrawl not configured");
      result = { status: "success", ...await firecrawlScrape(args.url, firecrawlKey) };

    // ═══════ Agent learning ═══════
    } else if (toolName === "update_instruction") {
      const { data: existing, error: fetchErr } = await sb.from("agent_instructions").select("id, content").eq("slug", args.slug).single();
      if (fetchErr || !existing) throw new Error(`Instruction "${args.slug}" not found`);
      const newContent = existing.content ? `${existing.content}\n- ${args.append_text}` : `- ${args.append_text}`;
      const { error: updateErr } = await sb.from("agent_instructions").update({ content: newContent, updated_at: new Date().toISOString() }).eq("id", existing.id);
      if (updateErr) throw updateErr;
      result = { status: "success", message: `Appended rule to "${args.slug}": ${args.append_text}` };
    } else if (toolName === "log_learning") {
      const { error: insertErr } = await sb.from("agent_learnings").insert({ trigger: args.trigger, correction: args.correction, instruction_slug: args.instruction_slug || null });
      if (insertErr) throw insertErr;
      result = { status: "success", message: "Learning logged" };

    // ═══════ Address verification ═══════
    } else if (toolName === "verify_address") {
      const geo = await verifyAddress(args.address);
      if (geo) {
        result = { status: "success", verified: true, standardized: geo.standardized, street: geo.street, city: geo.city, state: geo.state, zip: geo.zip, confidence: geo.confidence, coordinates: { lat: geo.lat, lng: geo.lng } };
      } else {
        result = { status: "success", verified: false, message: "Address could not be verified. Ask the customer to confirm." };
      }

    // ═══════ Communications (formerly communications-agent) ═══════
    } else if (toolName === "send_sms_to_employee") {
      const employees = await getActiveEmployees();
      const empName = (args.employee_name || "").toLowerCase();
      const matched = employees.find((e: any) => e.name.toLowerCase().includes(empName) || empName.includes(e.name.toLowerCase()));
      if (!matched) throw new Error("Employee not found");
      if (!matched.phone) throw new Error("No phone number on file");
      const smsResp = await invokeSpecialist(
        "send-sms",
        { to: matched.phone, body: args.message, source: "jarvis_internal_employee" },
        { "x-source-function": "jarvis_internal_employee", "x-hitl-approved": "true" },
      );
      result = { status: "sent", employee: matched.name, phone: matched.phone, message: args.message };

    } else if (toolName === "send_tech_form_link") {
      const employees = await getActiveEmployees();
      const identifier = (args.job_identifier || "").toLowerCase();
      const { data: jobs } = await sb.from("jobs")
        .select("id, hcp_job_number, customer_name, assigned_to, job_type")
        .or(`hcp_job_number.ilike.%${identifier}%,customer_name.ilike.%${identifier}%`)
        .order("created_at", { ascending: false }).limit(5);
      if (!jobs || jobs.length === 0) throw new Error(`No job found matching "${args.job_identifier}"`);
      const job = jobs[0];
      if (!job.assigned_to) throw new Error(`Job #${job.hcp_job_number} has no assigned tech`);
      const techName = job.assigned_to.toLowerCase();
      const matchedTech = employees.find((e: any) => e.name.toLowerCase().includes(techName) || techName.includes(e.name.toLowerCase()));
      if (!matchedTech?.phone) throw new Error(`Tech "${job.assigned_to}" not found or has no phone`);
      const formUrl = `${APP_BASE_URL}/form/${job.id}_${matchedTech.id}`;
      const photosUrl = `${APP_BASE_URL}/photos/${job.id}`;
      const smsBody = args.custom_message
        ? `${args.custom_message}\n${formUrl}\n📸 Photos: ${photosUrl}`
        : `📋 Job #${job.hcp_job_number} (${job.customer_name}) — please complete the tech form when done:\n${formUrl}\n📸 Photos: ${photosUrl}`;
      await invokeSpecialist(
        "send-sms",
        { to: matchedTech.phone, body: smsBody, job_id: job.id, source: "jarvis_internal_tech" },
        { "x-source-function": "jarvis_internal_tech", "x-hitl-approved": "true" },
      );
      result = { status: "sent", employee: matchedTech.name, phone: matchedTech.phone, job_number: job.hcp_job_number, customer: job.customer_name, form_url: formUrl };

    } else if (toolName === "search_sms_history") {
      const q = (args.query || "").toLowerCase();
      let query = sb.from("sms_log")
        .select("id, direction, phone_number, contact_name, contact_type, body, created_at, delivery_status, related_job_id, media_urls, jobs(hcp_job_number, customer_name)")
        .or(`phone_number.ilike.%${q}%,contact_name.ilike.%${q}%,body.ilike.%${q}%`)
        .order("created_at", { ascending: false }).limit(args.limit || 20);
      if (args.direction) query = query.eq("direction", args.direction);
      const { data: msgs, error } = await query;
      if (error) throw error;
      result = { status: "success", count: (msgs || []).length, messages: (msgs || []).map((m: any) => {
        const hasMedia = m.media_urls && Array.isArray(m.media_urls) && m.media_urls.length > 0;
        return {
          id: m.id, direction: m.direction, phone: m.phone_number, contact: m.contact_name || m.phone_number,
          type: m.contact_type, body: m.body?.slice(0, 1000), delivery: m.delivery_status,
          has_photos: hasMedia, photo_count: hasMedia ? m.media_urls.length : 0,
          job: m.jobs?.hcp_job_number ? `#${m.jobs.hcp_job_number} (${m.jobs.customer_name})` : null, date: m.created_at,
        };
      }) };

    } else if (toolName === "search_call_history") {
      const q = (args.query || "").toLowerCase();
      let query = sb.from("call_log")
        .select("direction, phone_number, contact_name, contact_type, status, duration_seconds, recording_url, created_at, is_read, transcription, ai_summary, call_extraction")
        .or(`phone_number.ilike.%${q}%,contact_name.ilike.%${q}%`)
        .order("created_at", { ascending: false }).limit(args.limit || 20);
      if (args.direction) query = query.eq("direction", args.direction);
      if (args.status) query = query.eq("status", args.status);
      const { data: calls, error } = await query;
      if (error) throw error;
      result = { status: "success", count: (calls || []).length, calls: (calls || []).map((c: any) => ({
        direction: c.direction, phone: c.phone_number, contact: c.contact_name || c.phone_number,
        type: c.contact_type, status: c.status,
        duration: c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m${c.duration_seconds % 60}s` : "0s",
        has_recording: !!c.recording_url, unread: !c.is_read, date: c.created_at,
        ai_summary: c.ai_summary || null,
        transcript: c.transcription ? c.transcription.slice(0, 1000) : null,
        extracted_data: c.call_extraction || null,
      })) };

    } else if (toolName === "read_chat_messages") {
      let query = sb.from("chat_messages")
        .select("sender_name, content, created_at, chat_channels(name)")
        .order("created_at", { ascending: false }).limit(args.limit || 20);
      if (args.channel_name) {
        const { data: ch } = await sb.from("chat_channels").select("id").ilike("name", `%${args.channel_name}%`).limit(1);
        if (ch && ch.length > 0) query = query.eq("channel_id", ch[0].id);
      }
      const { data: msgs, error } = await query;
      if (error) throw error;
      result = { status: "success", count: (msgs || []).length, messages: (msgs || []).map((m: any) => ({
        sender: m.sender_name, content: m.content, channel: m.chat_channels?.name || "unknown", time: m.created_at,
      })) };

    } else if (toolName === "send_chat_message") {
      const { data: channels } = await sb.from("chat_channels").select("id").ilike("name", `%${args.channel_name}%`).limit(1);
      if (!channels || channels.length === 0) throw new Error(`Channel "${args.channel_name}" not found`);
      const { error } = await sb.from("chat_messages").insert({
        channel_id: channels[0].id, user_id: "00000000-0000-0000-0000-000000000000",
        sender_name: "Copilot", content: args.message,
      });
      if (error) throw error;
      result = { status: "success", channel: args.channel_name, message: args.message };

    } else if (toolName === "create_quote") {
      const { data: quote, error: quoteErr } = await sb.from("quotes").insert({
        customer_name: args.customer_name, address: args.address || null,
        tonnage: args.tonnage, system_type: args.system_type, brand: args.brand || null,
        application: args.application || "residential", job_id: args.job_id || null,
        estimate_id: args.estimate_id || null, notes: args.notes || null, status: "draft",
      }).select("id").single();
      if (quoteErr) throw quoteErr;
      let matchQuery = sb.from("equipment_matchups")
        .select("id, tier, total_price, factory_rebate_price, monthly_payment, brand, condenser_model, coil_model, furnace_model, heat_kit, seer2, eer2, hspf2, afue, cooling_cap, cps_tonnage, ahri_number, early_rebate, burnout_rebate, system_type, application")
        .eq("tonnage", args.tonnage);
      if (args.system_type) matchQuery = matchQuery.ilike("system_type", `%${args.system_type}%`);
      if (args.brand) matchQuery = matchQuery.ilike("brand", `%${args.brand}%`);
      const { data: allMatchups } = await matchQuery;
      const multiKeys = new Set((allMatchups || []).filter((m: any) => m.application === "Multiposition").map((m: any) => `${m.brand}|${m.system_type}|${m.tonnage}|${m.tier}`));
      const matchups = (allMatchups || []).filter((m: any) => { if (m.application === "Multiposition" || !m.application) return true; return !multiKeys.has(`${m.brand}|${m.system_type}|${m.tonnage}|${m.tier}`); });
      const tierOrder = ["value", "value plus", "good", "better", "best", "ultimate"];
      const sortedMatchups = [...matchups].sort((a: any, b: any) => {
        const aTier = tierOrder.indexOf(String(a.tier || "").toLowerCase());
        const bTier = tierOrder.indexOf(String(b.tier || "").toLowerCase());
        const tierDiff = (aTier === -1 ? 999 : aTier) - (bTier === -1 ? 999 : bTier);
        if (tierDiff !== 0) return tierDiff;
        return (Number(b.seer2) || 0) - (Number(a.seer2) || 0)
          || (Number(b.eer2) || 0) - (Number(a.eer2) || 0)
          || (Number(b.hspf2) || 0) - (Number(a.hspf2) || 0);
      });
      const currency = (value: any) => value === null || value === undefined
        ? "N/A"
        : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
      const tonnageText = (value: any) => value === null || value === undefined
        ? ""
        : (Number(value) % 1 === 0 ? String(Number(value)) : String(value));
      const orientationText = (value: any) => {
        const raw = String(value || "").trim();
        if (!raw) return "Standard";
        return raw.toLowerCase().includes("multi") ? "Multi-Pos" : raw;
      };
      const airHandlerText = (value: any) => {
        const raw = String(value || "").trim();
        if (!raw) return "Air Handler";
        return raw.toLowerCase().includes("multi") ? "Multi-Position Air Handler" : `${raw} Air Handler`;
      };
      const systemTypeLabel = (value: any) => {
        const raw = String(value || "").toLowerCase();
        return raw.includes("heat") ? "Heat Pump" : "AC";
      };
      const indoorSpecLabel = (m: any) => {
        const raw = String(m.system_type || "").toLowerCase();
        if (raw.includes("heat")) return airHandlerText(m.application);
        if (raw.includes("gas") || raw.includes("dual")) return m.afue ? `Gas Furnace (${m.afue}% AFUE)` : "Gas Furnace";
        return m.furnace_model ? "Furnace" : "Air Handler";
      };
      const heaterLabel = (m: any) => {
        const raw = String(m.system_type || "").toLowerCase();
        if (raw.includes("heat")) return m.heat_kit ? "Electric Heat Kit (as required)" : "Electric Heat Kit";
        if (raw.includes("gas") || raw.includes("dual")) return "Gas Furnace (included above)";
        return m.heat_kit || "Included";
      };
      const options: any[] = [];
      const renderCards: string[] = [];
      for (let i = 0; i < sortedMatchups.length; i++) {
        const matchup = sortedMatchups[i];
        const optionTier = String(matchup.tier || `option ${i + 1}`).toLowerCase();
        const { error: optErr } = await sb.from("quote_options").insert({
          quote_id: quote.id,
          tier: optionTier,
          matchup_id: matchup.id,
          sort_order: i + 1,
          is_selected: i === 0,
        });
        if (!optErr) {
          const card = [
            ":::equipment-card",
            `**${matchup.brand} ${matchup.tier || "System"} Series – ${tonnageText(matchup.tonnage)} Ton ${systemTypeLabel(matchup.system_type)}**`,
            "",
            "# Specifications",
            `➡️ Orientation: ${orientationText(matchup.application)}`,
            `➡️ ${systemTypeLabel(matchup.system_type)}: ${matchup.brand} ${matchup.tier || "System"} Series – ${tonnageText(matchup.tonnage)} Ton`,
            `➡️ ${String(matchup.system_type || "").toLowerCase().includes("heat") ? "Air Handler" : "Furnace"}: ${indoorSpecLabel(matchup)}`,
            `➡️ Heater: ${heaterLabel(matchup)}`,
            "",
            "# Models | Serials",
            `➡️ OUTDOOR – ${matchup.condenser_model || "N/A"} | [Outdoor Serial here]`,
            `➡️ INDOOR – ${matchup.furnace_model || matchup.coil_model || "N/A"} | [Indoor Serial here]`,
            "",
            "# Efficiency",
            `➡️ AHRI#: ${matchup.ahri_number || "Not in database"}`,
            `➡️ SEER2: ${matchup.seer2 ?? "N/A"}`,
            `➡️ EER2: ${matchup.eer2 ?? "N/A"}`,
            `➡️ HSPF2: ${matchup.hspf2 ?? "N/A"}`,
            `➡️ Cooling Capacity: ${matchup.cooling_cap ?? "N/A"} BTU`,
            "",
            "# Pricing",
            `➡️ 0% APR · 36 Mo: ${currency(matchup.total_price)} (${currency(matchup.monthly_payment)}/mo)`,
            `➡️ 9.99% APR · 120 Mo: ${currency(matchup.monthly_payment_120 ?? calcMonthly120(matchup.total_price))}/mo`,
            `➡️ Instant Factory Rebate: ${currency(matchup.factory_rebate_price)}`,
            `➡️ CPS Rebate: ${matchup.early_rebate === null || matchup.early_rebate === undefined ? "N/A" : `-${currency(matchup.early_rebate)} → ${currency((Number(matchup.factory_rebate_price) || 0) - (Number(matchup.early_rebate) || 0))} after rebate`}`,
            ":::",
          ].join("\n");
          options.push({
            tier: matchup.tier,
            brand: matchup.brand,
            outdoor_model: matchup.condenser_model,
            indoor_model: matchup.furnace_model || matchup.coil_model,
            seer2: matchup.seer2,
            eer2: matchup.eer2,
            hspf2: matchup.hspf2,
            ahri_number: matchup.ahri_number,
            financed: matchup.total_price,
            instant_rebate_price: matchup.factory_rebate_price,
            monthly_payment_36: matchup.monthly_payment,
            monthly_payment_120: matchup.monthly_payment_120,
            application: matchup.application,
          });
          renderCards.push(card);
        }
      }
      result = {
        _instruction: "⚠️ YOUR ENTIRE RESPONSE MUST BE ONLY the render_ready_cards text below. Output it VERBATIM — no intro, no summary, no 'What\\'s Included', no 'Next Steps', no sales pitch, no commentary. ONLY the equipment card blocks. Nothing before. Nothing after.",
        render_ready_cards: renderCards.join("\n\n"),
        quote_id: quote.id,
      };

    } else if (toolName === "generate_install_quote") {
      const { data, error } = await sb.functions.invoke("generate-install-quote", {
        body: { brand: args.brand, tonnage: args.tonnage, system_type: args.system_type, tier: args.tier || null, location: args.location || null },
      });
      if (error) throw error;
      result = data;

    } else if (toolName === "convert_estimate_to_job") {
      let review: any = null;
      if (args.estimate_review_id) {
        const { data } = await sb.from("estimate_reviews").select("*, jobs(customer_name, address, customer_phone, customer_email, customer_id, job_type)").eq("id", args.estimate_review_id).eq("status", "approved").single();
        review = data;
      } else if (args.customer_name) {
        const { data: reviews } = await sb.from("estimate_reviews").select("*, jobs(customer_name, address, customer_phone, customer_email, customer_id, job_type)").eq("status", "approved").order("created_at", { ascending: false });
        review = (reviews || []).find((r: any) => r.jobs?.customer_name?.toLowerCase().includes(args.customer_name.toLowerCase()));
      }
      if (!review) throw new Error("No approved estimate found matching that criteria");
      const job = review.jobs;
      const { data: newJob, error: jobErr } = await sb.from("jobs").insert({
        customer_id: job?.customer_id || null, customer_name: job?.customer_name || "Unknown",
        customer_phone: job?.customer_phone || null, customer_email: job?.customer_email || null,
        address: job?.address || null, job_type: job?.job_type || "service",
        status: args.scheduled_date ? "scheduled" : "unscheduled", scheduled_date: args.scheduled_date || null,
        assigned_to: args.assigned_to || null,
        description: `Converted from approved estimate. Tiers: ${(review.selected_tiers || []).join(", ")}`,
      }).select().single();
      if (jobErr) throw jobErr;
      await sb.from("estimate_reviews").update({ status: "converted" }).eq("id", review.id);
      if (review.estimate_id) await sb.from("estimates").update({ work_status: "won" }).eq("id", review.estimate_id);
      // Route through finalize-job for chat channel, workflow, line items, HCP, formatting
      try {
        await sb.functions.invoke("finalize-job", { body: { job_id: newJob.id, created_by: "Copilot" } });
      } catch (e) { console.error("finalize-job error (estimate conversion):", e); }
      result = { status: "success", job_id: newJob.id, job_number: newJob.job_number, customer: job?.customer_name, message: `Created job${newJob.job_number ? " #" + newJob.job_number : ""} for ${job?.customer_name}.` };

    } else if (toolName === "generate_letterhead_document") {
      const employees = await getActiveEmployees();
      const { data: settingsRows } = await sb.from("company_settings").select("key, value");
      const settings: Record<string, string> = {};
      for (const row of (settingsRows || []) as any[]) settings[row.key] = row.value;
      let employeeInfo = "";
      if (args.employee_name) {
        const emp = employees.find((e: any) => e.name.toLowerCase().includes(args.employee_name.toLowerCase()));
        if (emp) employeeInfo = `${emp.name}, ${emp.role || "Team Member"}`;
      }
      result = {
        status: "success", type: "letterhead_document", document_type: args.document_type,
        recipient_name: args.recipient_name, recipient_address: args.recipient_address || null,
        employee_name: employeeInfo || args.employee_name || null, body_text: args.body_text,
        company: { name: settings.company_name || "", phone: settings.company_phone || "", email: settings.company_email || "", address: settings.company_address || "", city: settings.company_city || "", state: settings.company_state || "", zip: settings.company_zip || "", tacla: settings.tacla_number || "" },
        _instruction: "IMPORTANT: In your reply, wrap the letter content in :::letterhead and ::: delimiters so the frontend can render a PDF download button.",
      };

    // ═══════ Scheduling (formerly scheduling-agent) ═══════
    } else if (toolName === "get_travel_times") {
      result = await invokeSpecialist("calculate-travel-times", { tech_name: args.tech_name, date: args.date });
    } else if (toolName === "check_scheduling_fit") {
      result = await invokeSpecialist("calculate-travel-times", { tech_name: args.tech_name, date: args.date, proposed_address: args.proposed_address });
    } else if (toolName === "suggest_schedule_optimization") {
      const employees = await getActiveEmployees();
      const { data: settingsRows } = await sb.from("company_settings").select("key, value");
      const csMap: Record<string, string> = {};
      for (const row of (settingsRows || []) as any[]) csMap[row.key] = row.value;
      const maxJobsTech = parseInt(csMap.max_jobs_tech || "4");
      const maxJobsSales = parseInt(csMap.max_jobs_sales || "8");
      const centralNow = getCentralNow();
      const suggestions: any[] = [];
      const dates = [0, 1, 2].map(d => {
        const dt = new Date(centralNow.getTime() + d * 86400000);
        return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
      });
      for (const dt of dates) {
        const { data: dayJobs } = await sb.from("jobs").select("id, assigned_to").eq("scheduled_date", dt).not("status", "in", '("canceled")');
        if (!dayJobs || dayJobs.length === 0) continue;
        const techJobCounts: Record<string, { count: number; role: string }> = {};
        for (const j of dayJobs) {
          if (!j.assigned_to) continue;
          if (!techJobCounts[j.assigned_to]) {
            const emp = employees.find((e: any) => e.name === j.assigned_to);
            techJobCounts[j.assigned_to] = { count: 0, role: emp?.role || "tech" };
          }
          techJobCounts[j.assigned_to].count++;
        }
        for (const [name, info] of Object.entries(techJobCounts)) {
          const maxJobs = info.role === "sales" ? maxJobsSales : maxJobsTech;
          if (info.count < maxJobs) suggestions.push({ date: formatDateUS(dt), type: "capacity_available", message: `${name} has ${info.count}/${maxJobs} jobs on ${formatDateUS(dt)}` });
        }
      }
      result = { status: "success", suggestions, days_analyzed: dates.length };

    // ═══════ Search Customer CRM ═══════
    } else if (toolName === "search_customer") {
      const results: any[] = [];

      // Search by phone if provided
      if (args.phone) {
        const phoneDigits = (args.phone || "").replace(/\D/g, "").slice(-10);
        if (phoneDigits.length >= 7) {
          const { data: phoneMatches } = await sb.rpc("find_customer_by_phone", { digits: phoneDigits });
          if (phoneMatches?.length) {
            for (const pm of phoneMatches.slice(0, 5)) {
              const { data: c } = await sb.from("customers").select("*").eq("id", pm.id).single();
              if (c) results.push(c);
            }
          }
        }
      }

      // Search by name if provided
      if (args.name && results.length === 0) {
        const nameParts = (args.name || "").trim().split(/\s+/).filter(Boolean);
        let query = sb.from("customers").select("*");
        if (nameParts.length >= 2) {
          query = query.ilike("first_name", `%${nameParts[0]}%`).ilike("last_name", `%${nameParts[nameParts.length - 1]}%`);
        } else if (nameParts.length === 1) {
          query = query.or(`first_name.ilike.%${nameParts[0]}%,last_name.ilike.%${nameParts[0]}%`);
        }
        const { data: nameMatches } = await query.limit(10);
        if (nameMatches?.length) results.push(...nameMatches);
      }

      // Search by email if provided
      if (args.email && results.length === 0) {
        const { data: emailMatches } = await sb.from("customers").select("*").ilike("email", `%${args.email}%`).limit(5);
        if (emailMatches?.length) results.push(...emailMatches);
      }

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = results.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

      if (unique.length === 0) {
        result = { status: "no_match", message: "No customers found matching that criteria." };
      } else {
        result = {
          status: "found",
          count: unique.length,
          customers: unique.map(c => ({
            id: c.id, first_name: c.first_name, last_name: c.last_name,
            phone: c.phone, mobile_phone: c.mobile_phone, email: c.email,
            address: c.address, city: c.city, state: c.state, zip: c.zip,
            company: c.company, tags: c.tags,
          })),
        };
      }

    // ═══════ Search Vendor VRM ═══════
    } else if (toolName === "create_customer") {
      // ── Dedup Step 1: Address+zip (PRIMARY — addresses don't change) ──
      let existingCustomer: any = null;
      const addrNorm = (args.address || "").trim().toLowerCase().replace(/\b(apt|ste|suite|unit|#)\s*\S*/gi, "").trim();
      if (addrNorm.length >= 5 && args.zip) {
        const { data: addrMatches } = await sb.from("customers").select("*")
          .ilike("address", `%${addrNorm}%`)
          .eq("zip", args.zip.trim())
          .limit(1);
        if (addrMatches?.[0]) existingCustomer = addrMatches[0];
        if (existingCustomer) console.log(`JARVIS dedup (address+zip): found existing customer ${existingCustomer.id} at ${args.address}`);
      }

      // ── Dedup Step 2: Address+city (fallback if no zip) ──
      if (!existingCustomer && addrNorm.length >= 5 && args.city) {
        const { data: addrCityMatches } = await sb.from("customers").select("*")
          .ilike("address", `%${addrNorm}%`)
          .ilike("city", args.city.trim())
          .limit(1);
        if (addrCityMatches?.[0]) existingCustomer = addrCityMatches[0];
        if (existingCustomer) console.log(`JARVIS dedup (address+city): found existing customer ${existingCustomer.id} at ${args.address}`);
      }

      // ── Dedup Step 3: Phone ──
      if (!existingCustomer && args.phone) {
        const phoneDigits = (args.phone || "").replace(/\D/g, "").slice(-10);
        if (phoneDigits.length >= 10) {
          const { data: phoneMatch } = await sb.rpc("find_customer_by_phone", { digits: phoneDigits });
          if (phoneMatch?.[0]) {
            const { data: fullCust } = await sb.from("customers").select("*").eq("id", phoneMatch[0].id).single();
            if (fullCust) existingCustomer = fullCust;
            if (existingCustomer) console.log(`JARVIS dedup (phone): found existing customer ${existingCustomer.id} for ${args.phone}`);
          }
        }
      }

      // ── Dedup Step 4: Name + partial address match (no zip needed) ──
      if (!existingCustomer && args.first_name && args.last_name && addrNorm.length >= 5) {
        const { data: nameAddrMatches } = await sb.from("customers").select("*")
          .ilike("first_name", args.first_name.trim())
          .ilike("last_name", args.last_name.trim())
          .ilike("address", `%${addrNorm}%`)
          .limit(1);
        if (nameAddrMatches?.[0]) existingCustomer = nameAddrMatches[0];
        if (existingCustomer) console.log(`JARVIS dedup (name+address): found existing customer ${existingCustomer.id}`);
      }

      // ── Dedup Step 5: Name + phone partial (last 7 digits) ──
      if (!existingCustomer && args.first_name && args.last_name && args.phone) {
        const last7 = args.phone.replace(/\D/g, "").slice(-7);
        if (last7.length === 7) {
          const { data: namePhoneMatches } = await sb.from("customers").select("*")
            .ilike("first_name", args.first_name.trim())
            .ilike("last_name", args.last_name.trim())
            .or(`phone.ilike.%${last7}%,mobile_phone.ilike.%${last7}%`)
            .limit(1);
          if (namePhoneMatches?.[0]) existingCustomer = namePhoneMatches[0];
          if (existingCustomer) console.log(`JARVIS dedup (name+phone): found existing customer ${existingCustomer.id}`);
        }
      }

      let data: any;
      if (existingCustomer) {
        console.log(`JARVIS dedup: found existing customer ${existingCustomer.id} for ${args.phone || args.address}`);
        // Enrich missing fields — SAFETY: NEVER overwrite existing name/address with different values
        const updates: any = {};
        if (!existingCustomer.email && args.email) updates.email = args.email;
        if (!existingCustomer.address && args.address) updates.address = args.address;
        if (!existingCustomer.city && args.city) updates.city = args.city;
        if (!existingCustomer.state && args.state) updates.state = args.state;
        if (!existingCustomer.zip && args.zip) updates.zip = args.zip;
        if (!existingCustomer.phone && args.phone) updates.phone = args.phone;
        if (!existingCustomer.mobile_phone && args.phone && existingCustomer.phone) updates.mobile_phone = args.phone;

        // Log conflicts for dispatcher review instead of overwriting
        const conflicts: string[] = [];
        if (existingCustomer.first_name && args.first_name && existingCustomer.first_name.toLowerCase() !== args.first_name.toLowerCase()) {
          conflicts.push(`Name conflict: DB="${existingCustomer.first_name}" vs incoming="${args.first_name}"`);
        }
        if (existingCustomer.last_name && args.last_name && existingCustomer.last_name.toLowerCase() !== args.last_name.toLowerCase()) {
          conflicts.push(`Last name conflict: DB="${existingCustomer.last_name}" vs incoming="${args.last_name}"`);
        }
        if (existingCustomer.address && args.address && existingCustomer.address.toLowerCase() !== args.address.toLowerCase()) {
          conflicts.push(`Address conflict: DB="${existingCustomer.address}" vs incoming="${args.address}"`);
        }
        if (conflicts.length > 0) {
          console.warn(`JARVIS safety: ${conflicts.length} data conflict(s) for customer ${existingCustomer.id}: ${conflicts.join("; ")}`);
          await sb.from("activity_log").insert({
            action: "customer_data_conflict",
            details: `⚠️ Data conflict detected for ${existingCustomer.first_name} ${existingCustomer.last_name} (${existingCustomer.id}): ${conflicts.join("; ")}. Existing data preserved — review manually.`,
            performed_by: "Copilot",
          });
        }

        if (Object.keys(updates).length > 0) {
          await sb.from("customers").update(updates).eq("id", existingCustomer.id);
        }
        data = { ...existingCustomer, ...updates, _conflicts: conflicts.length > 0 ? conflicts : undefined };
      } else {
        const { data: newCust, error } = await sb.from("customers").insert({
          first_name: args.first_name || null, last_name: args.last_name || null,
          phone: args.phone || null, email: args.email || null,
          address: args.address || null, city: args.city || null,
          state: args.state || null, zip: args.zip || null, notes: args.notes || null,
        }).select().single();
        if (error) throw error;
        data = newCust;
      }

      result = { status: "success", customer_id: data.id, message: `Created customer in UltraOffice: ${args.first_name} ${args.last_name} (${data.id})` };

    } else if (toolName === "update_customer") {
      // Update the UltraOffice customer record. Default behavior preserves old phone as mobile_phone.
      const custId = args.customer_id;
      if (!custId) throw new Error("update_customer requires customer_id");

      const { data: existing, error: fetchErr } = await sb.from("customers").select("*").eq("id", custId).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing) throw new Error(`Customer ${custId} not found`);

      const updates: any = { updated_at: new Date().toISOString() };
      const fields = ["first_name", "last_name", "email", "address", "city", "state", "zip", "notes", "mobile_phone"];
      for (const f of fields) {
        if (args[f] !== undefined && args[f] !== null && args[f] !== "") updates[f] = args[f];
      }

      // Phone change with preserve-old-as-mobile (default true)
      const preserveOldPhone = args.preserve_old_phone !== false;
      if (args.phone !== undefined && args.phone !== null && args.phone !== "") {
        const oldPhone = existing.phone;
        updates.phone = args.phone;
        if (preserveOldPhone && oldPhone && !updates.mobile_phone && !existing.mobile_phone) {
          updates.mobile_phone = oldPhone;
        }
      }

      const { error: updateErr } = await sb.from("customers").update(updates).eq("id", custId);
      if (updateErr) throw updateErr;

      const changedFields = Object.keys(updates).filter(k => k !== "updated_at");
      await sb.from("activity_log").insert({
        action: "customer_updated",
        details: `Updated ${existing.first_name} ${existing.last_name} (${custId}): ${changedFields.join(", ")}`,
        performed_by: "JARVIS",
      });

      result = { status: "success", customer_id: custId, updated_fields: changedFields, message: `Updated ${existing.first_name} ${existing.last_name}: ${changedFields.join(", ")}` };

    } else if (toolName === "create_job") {
      // ── Resolve assigned_to: fuzzy match employee name → exact DB name ──
      let resolvedAssignedTo: string | null = null;
      if (args.assigned_to) {
        const { data: empRows } = await sb.from("employees").select("name").eq("is_active", true);
        const employees = (empRows || []).map((e: any) => e.name);
        const searchName = args.assigned_to.toLowerCase().trim();
        // Try exact match first
        resolvedAssignedTo = employees.find((n: string) => n.toLowerCase() === searchName) || null;
        // Then partial/fuzzy: "Jonathan" matches "Jonathan Carnes"
        if (!resolvedAssignedTo) {
          resolvedAssignedTo = employees.find((n: string) =>
            n.toLowerCase().includes(searchName) || searchName.includes(n.toLowerCase())
          ) || null;
        }
        // Last resort: match any single word (first or last name)
        if (!resolvedAssignedTo) {
          const words = searchName.split(/\s+/);
          resolvedAssignedTo = employees.find((n: string) =>
            words.some((w: string) => w.length > 2 && n.toLowerCase().includes(w))
          ) || null;
        }
        if (!resolvedAssignedTo) {
          console.warn(`Could not resolve employee name "${args.assigned_to}" — creating job unassigned`);
        }
      }

      // ── Auto-resolve customer data: fill in gaps from customer record ──
      let custId = args.customer_id || null;

      // If JARVIS passed an HCP customer ID (cus_...) instead of a UUID, resolve it
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (custId && !UUID_RE.test(custId)) {
        console.log(`customer_id "${custId}" is not a UUID — attempting HCP ID resolution`);
        const { data: hcpCust } = await sb.from("customers").select("id").eq("hcp_customer_id", custId).maybeSingle();
        if (hcpCust) {
          console.log(`Resolved HCP customer "${custId}" → local UUID ${hcpCust.id}`);
          custId = hcpCust.id;
        } else {
          console.warn(`Could not resolve HCP customer ID "${custId}" — will try name/phone lookup`);
          custId = null;
        }
      }

      let custPhone = args.customer_phone || null;
      let custEmail = args.customer_email || null;
      let custAddress = args.address || null;

      const normalizePhone = (value: string | null | undefined) => (value || "").replace(/\D/g, "").slice(-10);
      const normalizeName = (value: string | null | undefined) =>
        (value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const normalizeStreet = (value: string | null | undefined) => {
        const street = ((value || "").split(",")[0] || "").toLowerCase();
        return street
          .replace(/\b(street)\b/g, "st")
          .replace(/\b(avenue)\b/g, "ave")
          .replace(/\b(road)\b/g, "rd")
          .replace(/\b(drive)\b/g, "dr")
          .replace(/\b(lane)\b/g, "ln")
          .replace(/\b(court)\b/g, "ct")
          .replace(/\b(boulevard)\b/g, "blvd")
          .replace(/\b(place)\b/g, "pl")
          .replace(/\b(circle)\b/g, "cir")
          .replace(/\b(terrace)\b/g, "ter")
          .replace(/\b(parkway)\b/g, "pkwy")
          .replace(/[\u0080-\uFFFF]+/g, " ")
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      };

      const requestedName = normalizeName(args.customer_name);
      const requestedPhoneDigits = normalizePhone(custPhone);
      const requestedStreet = normalizeStreet(custAddress);

      const getCustomerMatch = (candidate: any) => {
        const candidateName = normalizeName([candidate.first_name, candidate.last_name].filter(Boolean).join(" "));
        const candidatePhoneDigits = normalizePhone(candidate.mobile_phone || candidate.phone);
        const candidateStreet = normalizeStreet([candidate.address, candidate.city, candidate.state, candidate.zip].filter(Boolean).join(", "));

        const nameMatch = !!requestedName && (
          candidateName === requestedName ||
          candidateName.startsWith(`${requestedName} `) ||
          candidateName.endsWith(` ${requestedName}`)
        );
        const phoneMatch = requestedPhoneDigits.length === 10 && candidatePhoneDigits === requestedPhoneDigits;
        const addressMatch = requestedStreet.length >= 5 && candidateStreet === requestedStreet;

        const compatible =
          phoneMatch ||
          (addressMatch && (!requestedName || nameMatch)) ||
          (nameMatch && !requestedPhoneDigits && !requestedStreet);

        return { nameMatch, phoneMatch, addressMatch, compatible, candidateName, candidateStreet, candidatePhoneDigits };
      };

      const hydrateFromCustomer = (candidate: any) => {
        custId = candidate.id;
        if (!custPhone) custPhone = candidate.mobile_phone || candidate.phone || null;
        if (!custEmail) custEmail = candidate.email || null;
        if (!custAddress && candidate.address) {
          custAddress = [candidate.address, candidate.city, candidate.state, candidate.zip].filter(Boolean).join(", ");
        }
      };

      // Validate an explicit customer_id before trusting it
      if (custId) {
        const { data: explicitCust } = await sb.from("customers")
          .select("id, first_name, last_name, phone, mobile_phone, email, address, city, state, zip")
          .eq("id", custId)
          .maybeSingle();

        if (explicitCust) {
          const explicitMatch = getCustomerMatch(explicitCust);
          if (explicitMatch.compatible) {
            hydrateFromCustomer(explicitCust);
          } else {
            console.warn(`Rejected provided customer_id ${custId} for create_job — request did not match customer identity/address`);
            custId = null;
          }
        } else {
          custId = null;
        }
      }

      // If no customer_id but we have a name, only accept a match when another signal confirms it
      if (!custId && args.customer_name) {
        const nameParts = args.customer_name.trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        let custQuery = sb.from("customers").select("id, first_name, last_name, phone, mobile_phone, email, address, city, state, zip");
        if (firstName && lastName) {
          custQuery = custQuery.ilike("first_name", `%${firstName}%`).ilike("last_name", `%${lastName}%`);
        } else {
          custQuery = custQuery.or(`first_name.ilike.%${firstName}%,last_name.ilike.%${firstName}%`);
        }
        const { data: custMatches } = await custQuery.limit(5);
        const ranked = (custMatches || [])
          .map((candidate: any) => ({ candidate, match: getCustomerMatch(candidate) }))
          .filter((row: any) => row.match.compatible)
          .sort((a: any, b: any) => {
            const scoreA = (a.match.phoneMatch ? 4 : 0) + (a.match.addressMatch ? 3 : 0) + (a.match.nameMatch ? 1 : 0);
            const scoreB = (b.match.phoneMatch ? 4 : 0) + (b.match.addressMatch ? 3 : 0) + (b.match.nameMatch ? 1 : 0);
            return scoreB - scoreA;
          });

        if (ranked[0]) {
          hydrateFromCustomer(ranked[0].candidate);
        } else if ((custMatches || []).length > 0) {
          console.warn(`Name-only customer lookup for "${args.customer_name}" returned candidates, but none were safely compatible with the requested phone/address`);
        }
      }

      // ── Phone-based fallback: exact phone match is authoritative ──
      if (!custId && custPhone) {
        const digits = custPhone.replace(/\D/g, "").slice(-10);
        if (digits.length === 10) {
          const { data: phoneCust } = await sb.rpc("find_customer_by_phone", { digits }).limit(1).maybeSingle();
          if (phoneCust) {
            const { data: fullCust } = await sb.from("customers")
              .select("id, first_name, last_name, phone, mobile_phone, email, address, city, state, zip")
              .eq("id", phoneCust.id)
              .maybeSingle();
            if (fullCust) hydrateFromCustomer(fullCust);
          }
        }
      }

      // ── Address-based fallback: only reuse if the requested name also matches that address ──
      if (!custId && custAddress) {
        const addrParts = custAddress.split(",").map((p: string) => p.trim());
        const streetPart = addrParts[0] || "";
        if (streetPart.length > 5) {
          const { data: addrMatch } = await sb.from("customers")
            .select("id, first_name, last_name, phone, mobile_phone, email, address, city, state, zip")
            .ilike("address", `%${streetPart}%`)
            .limit(1)
            .maybeSingle();
          if (addrMatch) {
            const addrIdentityMatch = getCustomerMatch(addrMatch);
            if (!requestedName || addrIdentityMatch.nameMatch) {
              hydrateFromCustomer(addrMatch);
            } else {
              console.warn(`Rejected address-only customer reuse for ${custAddress} because the name did not match the existing customer at that property`);
            }
          }
        }
      }

      // If we have a customer_id, enrich any missing fields from the customer record
      if (custId && (!custPhone || !custAddress || !custEmail)) {
        const { data: cust } = await sb.from("customers")
          .select("phone, mobile_phone, email, address, city, state, zip")
          .eq("id", custId).maybeSingle();
        if (cust) {
          if (!custPhone) custPhone = cust.mobile_phone || cust.phone || null;
          if (!custEmail) custEmail = cust.email || null;
          if (!custAddress && cust.address) {
            custAddress = [cust.address, cust.city, cust.state, cust.zip].filter(Boolean).join(", ");
          }
        }
      }

      // ── Build arrival window: default 30-min window from scheduled_time ──
      // CRITICAL: append America/Chicago offset so Postgres stores the correct instant
      let arrivalStart: string | null = null;
      let arrivalEnd: string | null = null;
      if (args.scheduled_date && args.scheduled_time) {
        // Determine CDT (-05:00) vs CST (-06:00) for America/Chicago
        const offsetStr = detectCentralOffset(args.scheduled_date);
        arrivalStart = `${args.scheduled_date}T${args.scheduled_time}:00${offsetStr}`;
        // Calculate end = start + 30 minutes (callback) or 2 hours (service)
        const windowMinutes = (args.job_type === "phone_call") ? 30 : 120;
        const startDate = new Date(`${args.scheduled_date}T${args.scheduled_time}:00${offsetStr}`);
        const endDate = new Date(startDate.getTime() + windowMinutes * 60 * 1000);
        // Build end time in local components to avoid UTC conversion bug
        const offsetHours = offsetStr === "-05:00" ? -5 : -6;
        const endLocal = new Date(endDate.getTime() + offsetHours * 3600000);
        const ey = endLocal.getUTCFullYear();
        const emo = String(endLocal.getUTCMonth() + 1).padStart(2, "0");
        const ed = String(endLocal.getUTCDate()).padStart(2, "0");
        const eh = String(endLocal.getUTCHours()).padStart(2, "0");
        const emin = String(endLocal.getUTCMinutes()).padStart(2, "0");
        const es = String(endLocal.getUTCSeconds()).padStart(2, "0");
        arrivalEnd = `${ey}-${emo}-${ed}T${eh}:${emin}:${es}${offsetStr}`;
      }

      // ── HITL: Surface an action_item card instead of directly creating the job ──
      const jobProposal: any = {
        customer_id: custId,
        customer_name: args.customer_name || "Unknown",
        description: args.description || "Service call",
        job_type: args.job_type || "service",
        address: custAddress,
        assigned_to: resolvedAssignedTo,
        customer_phone: custPhone,
        customer_email: custEmail,
        scheduled_date: args.scheduled_date || null,
        scheduled_time: args.scheduled_time || null,
      };

      // Build a human-readable title for the card
      const cardTitle = `New ${args.job_type || "service"} — ${args.customer_name}${args.scheduled_date ? " on " + args.scheduled_date : ""}`;
      const cardDesc = [
        custAddress ? `📍 ${custAddress}` : null,
        resolvedAssignedTo ? `👷 Assigned to: ${resolvedAssignedTo}` : null,
        args.scheduled_time ? `🕐 Time: ${args.scheduled_time}` : null,
        args.description ? `📝 ${args.description}` : null,
        custPhone ? `📞 ${custPhone}` : null,
      ].filter(Boolean).join("\n");

      const { data: actionItem, error: aiError } = await sb.from("action_items").insert({
        title: cardTitle,
        description: cardDesc,
        category: "new_appointment",
        priority: "normal",
        status: "pending",
        source: "jarvis",
        customer_phone: custPhone,
        suggested_action: "Create this job on the dispatch board",
        metadata: jobProposal,
        // Rule 22: populate unified 5W facts payload for JarvisFactCard renderer
        facts: {
          who: args.customer_name
            ? { label: args.customer_name, customer_id: args.customer_id || undefined, phone: custPhone || undefined }
            : (custPhone ? { label: custPhone, phone: custPhone } : undefined),
          what: { label: `New ${args.job_type || "service"}`, category: "new_appointment" },
          when: args.scheduled_date
            ? { label: args.scheduled_time ? `${args.scheduled_date} ${args.scheduled_time}` : args.scheduled_date }
            : undefined,
          where: custAddress ? { label: "Service address", address: custAddress } : undefined,
          why: { label: "JARVIS proposed from intake", source: "ai_inference" },
        },
      }).select().single();

      if (aiError) throw aiError;

      await sb.from("activity_log").insert({
        action: "job_proposed",
        details: `JARVIS proposed ${args.job_type} for ${args.customer_name}${resolvedAssignedTo ? ", assigned to " + resolvedAssignedTo : ""}${args.scheduled_date ? " on " + args.scheduled_date : ""} — awaiting dispatcher approval`,
        performed_by: "Copilot",
      });

      result = {
        status: "pending_approval",
        action_item_id: actionItem.id,
        message: `⏳ QUEUED FOR YOUR APPROVAL — ${args.job_type} for ${args.customer_name}${resolvedAssignedTo ? ", assigned to " + resolvedAssignedTo : ""}${args.scheduled_date ? " on " + args.scheduled_date : ""}. This is NOT booked yet. An approval card is now in your Mission Control "Now" tab — tap Accept to confirm or Dismiss to cancel. The job will only be created after you approve it.`
      };

    // ═══════ Remaining specialists (direct edge function invoke) ═══════
    } else if (toolName === "invoke_repair_quote") {
      result = await invokeSpecialist("repair-quote-agent", { job_id: args.job_id, target_margin: args.target_margin });
    } else if (toolName === "invoke_supplyhouse") {
      try {
        result = await invokeSpecialist("supplyhouse-agent", args);
        // Check if the result indicates failure even with 200 status
        if (result && result.success === false) {
          result = { status: "error", tool: "invoke_supplyhouse", error: result.error || "SupplyHouse search failed", message: "SupplyHouse.com tool failed. Tell the user you tried their supplier account but it encountered an issue. You may fall back to web_search as a backup." };
        } else if (result && result.results && result.results.length === 0) {
          result = { status: "no_results", tool: "invoke_supplyhouse", message: "SupplyHouse search returned no results for this query. Tell the user, then try web_search as a fallback." };
        }
      } catch (e) {
        console.error("invoke_supplyhouse error:", e);
        result = { status: "error", tool: "invoke_supplyhouse", error: e instanceof Error ? e.message : "Unknown error", message: "SupplyHouse.com tool failed. Tell the user you tried their supplier account but it encountered an issue. You may fall back to web_search as a backup." };
      }
    } else if (toolName === "invoke_carrier_enterprise") {
      try {
        result = await invokeSpecialist("carrier-enterprise-agent", args);
        if (result && result.success === false) {
          result = { status: "error", tool: "invoke_carrier_enterprise", error: result.error || "Carrier Enterprise search failed", message: "Carrier Enterprise tool failed. Tell the user you tried their supplier account but it encountered an issue. You may fall back to web_search as a backup." };
        }
      } catch (e) {
        console.error("invoke_carrier_enterprise error:", e);
        result = { status: "error", tool: "invoke_carrier_enterprise", error: e instanceof Error ? e.message : "Unknown error", message: "Carrier Enterprise tool failed. Tell the user you tried their supplier account but it encountered an issue. You may fall back to web_search as a backup." };
      }
    } else if (toolName === "invoke_invoicing") {
      result = await invokeSpecialist("invoicing-agent", args);

    // ═══════ Operational job tools ═══════
    } else if (toolName === "update_job_field") {
      // Whitelist of allowed fields for security
      const ALLOWED_FIELDS = new Set([
        "status", "permit_status", "inspection_status",
        "equipment_ordered_at", "permit_pulled_at", "deposit_paid_at", "finance_paperwork_at",
        "confirmation_sent_at", "preinstall_sent_at", "dispatch_sent_at", "on_my_way_sent_at",
        "completion_form_sent_at", "photos_uploaded_at", "invoice_sent_at", "payment_collected_at",
        "review_request_sent_at", "warranty_registered_at", "rebate_submitted_at",
        "inspection_scheduled_at", "inspection_passed_at", "follow_up_completed_at",
        "maint_report_sent_at", "next_visit_scheduled_at", "agreement_offered_at",
        "presentation_sent_at", "tech_proposal_at", "jurisdiction_looked_up_at",
        "scheduled_date", "assigned_to", "arrival_start", "arrival_end",
      ]);
      if (!ALLOWED_FIELDS.has(args.field_name)) {
        throw new Error(`Field "${args.field_name}" is not in the allowed whitelist. Allowed: ${[...ALLOWED_FIELDS].join(", ")}`);
      }
      const value = args.value || (args.field_name.endsWith("_at") ? new Date().toISOString() : undefined);
      if (value === undefined) throw new Error(`Value required for non-timestamp field "${args.field_name}"`);

      const { data: updated, error: updateErr } = await sb.from("jobs")
        .update({ [args.field_name]: value })
        .eq("id", args.job_id)
        .select("id, hcp_job_number, customer_name, status")
        .single();
      if (updateErr) throw updateErr;
      await sb.from("activity_log").insert({
        action: `field_updated: ${args.field_name}`,
        job_id: args.job_id,
        details: `Set ${args.field_name} = ${value}`,
        performed_by: "Copilot",
      });
      result = { status: "success", job_number: updated.hcp_job_number, field: args.field_name, value, message: `Updated ${args.field_name} on job #${updated.hcp_job_number || updated.id}` };

    } else if (toolName === "create_parts_order") {
      const { error: insertErr } = await sb.from("parts_orders").insert({
        job_id: args.job_id,
        description: args.description || null,
        supply_house_id: args.supply_house_id || null,
        po_number: args.po_number || null,
        expected_arrival: args.expected_arrival || null,
        status: "ordered",
        ordered_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;
      await sb.from("activity_log").insert({
        action: "parts_order_created",
        job_id: args.job_id,
        details: args.description || "Parts order created",
        performed_by: "Copilot",
      });
      result = { status: "success", message: `Parts order created for job ${args.job_id}${args.description ? ": " + args.description : ""}` };

    } else if (toolName === "update_warranty_status") {
      const { error: upsertErr } = await sb.from("warranty_registrations").upsert({
        job_id: args.job_id,
        status: args.status,
        registered_at: args.status === "registered" ? new Date().toISOString() : null,
        confirmation_number: args.confirmation_number || null,
        notes: args.notes || null,
      }, { onConflict: "job_id" });
      if (upsertErr) throw upsertErr;
      await sb.from("activity_log").insert({
        action: `warranty_${args.status}`,
        job_id: args.job_id,
        details: `Warranty status: ${args.status}${args.confirmation_number ? " — conf: " + args.confirmation_number : ""}`,
        performed_by: "Copilot",
      });
      result = { status: "success", message: `Warranty ${args.status} for job ${args.job_id}${args.confirmation_number ? " (conf: " + args.confirmation_number + ")" : ""}` };

    // ═══════ Live Transcript ═══════
    } else if (toolName === "get_live_transcript") {
      const { data: transcriptRows, error: ltErr } = await sb
        .from("live_transcripts")
        .select("speaker, text, is_final, created_at")
        .eq("twilio_sid", args.twilio_sid)
        .eq("is_final", true)
        .order("created_at", { ascending: true })
        .limit(200);
      if (ltErr) throw ltErr;
      if (!transcriptRows || transcriptRows.length === 0) {
        result = { status: "success", message: "No transcript available yet for this call.", transcript: [] };
      } else {
        const formatted = transcriptRows.map((r: any) => `[${r.speaker}]: ${r.text}`).join("\n");
        result = { status: "success", line_count: transcriptRows.length, transcript: formatted };
      }
    // ═══════ Suggest Actions (Smart Dispatcher Buttons) ═══════
    } else if (toolName === "suggest_actions") {
      // Pass through the structured actions — the frontend renders them as buttons
      const actions = (args.actions || []).map((a: any) => ({
        type: a.type,
        job_type: a.job_type || undefined,
        customer_name: a.customer_name || undefined,
        customer_id: a.customer_id || undefined,
        phone: a.phone || undefined,
        address: a.address || undefined,
        description: a.description || undefined,
        email: a.email || undefined,
        payload: a.payload || undefined,
        label: a.label || undefined,
        subject: a.subject || undefined,
        job_id: a.job_id || undefined,
      }));
      result = { status: "success", _suggested_actions: actions, message: `Presenting ${actions.length} action button(s) to the dispatcher.` };

    // ═══════ To-Do List (removed) ═══════
    } else if (toolName === "create_todo" || toolName === "complete_todo") {
      result = { status: "removed", message: "The To-Do system has been removed." };
    } else if (toolName === "move_photos_to_job") {
      const smsIds = args.sms_ids as string[];
      let jobId = args.target_job_id as string | undefined;

      // If estimate ID provided, look up its source job
      if (!jobId && args.target_estimate_id) {
        const { data: est } = await sb.from("estimates").select("source_job_id").eq("id", args.target_estimate_id).maybeSingle();
        if (est?.source_job_id) jobId = est.source_job_id;
        // Also check if there's a job linked to this estimate
        if (!jobId) {
          const { data: linkedJob } = await sb.from("jobs").select("id").eq("estimate_id", args.target_estimate_id).maybeSingle();
          if (linkedJob?.id) jobId = linkedJob.id;
        }
        if (!jobId) {
          result = { status: "error", message: "Could not find a job linked to that estimate. Please provide a target_job_id instead." };
          return result;
        }
      }

      if (!jobId) {
        result = { status: "error", message: "Either target_job_id or target_estimate_id is required." };
        return result;
      }

      // Fetch media_urls from the specified SMS messages
      const { data: smsRows, error: smsErr } = await sb.from("sms_log").select("id, media_urls, phone_number, contact_name").in("id", smsIds);
      if (smsErr) throw smsErr;

      const attachments: { file_name: string; file_path: string; file_type: string }[] = [];
      for (const sms of smsRows || []) {
        const mediaList = sms.media_urls as any[];
        if (!mediaList || !Array.isArray(mediaList)) continue;
        for (const media of mediaList) {
          const url = typeof media === "string" ? media : media.url;
          if (!url) continue;
          const contentType = typeof media === "object" ? media.content_type : "image/jpeg";
          // Derive file name from URL
          const urlParts = url.split("/");
          const fileName = urlParts[urlParts.length - 1] || `photo_${Date.now()}.jpg`;
          attachments.push({ file_name: fileName, file_path: url, file_type: contentType || "image/jpeg" });
        }
      }

      if (attachments.length === 0) {
        result = { status: "error", message: "No photos found in the specified SMS messages." };
        return result;
      }

      // Insert into job_attachments
      const inserts = attachments.map(a => ({ job_id: jobId, file_name: a.file_name, file_path: a.file_path, file_type: a.file_type }));
      const { error: insertErr } = await sb.from("job_attachments").insert(inserts);
      if (insertErr) throw insertErr;

      // Log the action
      await sb.from("activity_log").insert({
        job_id: jobId,
        action: "photos_moved_from_sms",
        performed_by: "JARVIS",
        details: `Moved ${attachments.length} photo(s) from SMS to job${args.customer_name ? ` for ${args.customer_name}` : ""}`,
      });

      result = { status: "success", message: `Successfully attached ${attachments.length} photo(s) to job ${jobId}`, attachments_added: attachments.length };
    }

  } catch (e) {
    result = { status: "error", error: e instanceof Error ? e.message : "Tool execution failed" };
  }

  if (approvedAction?.actionItemId && result?.status !== "error") {
    await sb.from("action_items").update({
      status: "accepted",
      resolved_at: new Date().toISOString(),
      resolved_by: approvedAction.userId || null,
      metadata: {
        ...(approvedAction.metadata || {}),
        executed_at: new Date().toISOString(),
        execution_result: result,
      },
    }).eq("id", approvedAction.actionItemId);
  }

  return result;
}

function flattenChatContent(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: any) => {
      if (!part) return "";
      if (typeof part === "string") return part;
      if (typeof part.text === "string") return part.text;
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLatestUserMessageText(messages: any[]): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      return flattenChatContent(messages[i]?.content);
    }
  }
  return "";
}

function extractCustomerLookupHints(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const phone = normalized.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/)?.[0];
  const email = normalized.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  const lookupIntent = /\b(do we have|look up|lookup|search for|find|record for|customer record|existing customer|in our crm|in the crm|in our database|in the database|do we know|do you know)\b/i.test(normalized);

  const keywordName = normalized.match(/\b(?:for|about|named|customer|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/)?.[1];
  const trailingName = normalized.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:is|in|from|with)\b/)?.[1];
  const genericName = normalized.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/)?.[1];
  const name = keywordName || trailingName || genericName;

  if (!lookupIntent && !phone && !email && !name) return null;

  return {
    latestUserText: normalized,
    lookupIntent,
    phone,
    email,
    name,
  };
}

async function preflightCustomerLookup(sb: any, latestUserText: string) {
  const hints = extractCustomerLookupHints(latestUserText);
  if (!hints) return null;

  const results: any[] = [];

  if (hints.phone) {
    const phoneDigits = hints.phone.replace(/\D/g, "").slice(-10);
    if (phoneDigits.length === 10) {
      const { data: phoneMatches } = await sb.rpc("find_customer_by_phone", { digits: phoneDigits });
      for (const match of phoneMatches || []) {
        const { data: fullCustomer } = await sb.from("customers").select("*").eq("id", match.id).maybeSingle();
        if (fullCustomer) results.push(fullCustomer);
      }
    }
  }

  if (hints.email) {
    const { data: emailMatches } = await sb.from("customers").select("*").ilike("email", `%${hints.email}%`).limit(5);
    if (emailMatches?.length) results.push(...emailMatches);
  }

  if (hints.name) {
    const { data: nameMatches } = await sb.rpc("get_customers_paginated", {
      p_search: hints.name,
      p_sort_by: "recent",
      p_page_num: 0,
      p_page_size: 5,
    });
    if (nameMatches?.length) results.push(...nameMatches);
  }

  const seen = new Set<string>();
  const customers = results.filter((customer: any) => {
    if (!customer?.id || seen.has(customer.id)) return false;
    seen.add(customer.id);
    return true;
  });

  return {
    attempted: true,
    toolArgs: {
      ...(hints.name ? { name: hints.name } : {}),
      ...(hints.phone ? { phone: hints.phone } : {}),
      ...(hints.email ? { email: hints.email } : {}),
    },
    latestUserText: hints.latestUserText,
    status: customers.length > 0 ? "found" : "no_match",
    count: customers.length,
    customers: customers.map((c: any) => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      company: c.company,
      phone: c.phone,
      mobile_phone: c.mobile_phone,
      email: c.email,
      address: c.address,
      city: c.city,
      state: c.state,
      zip: c.zip,
    })),
  };
}

function buildCustomerLookupContext(preflightLookup: any): string {
  if (!preflightLookup?.attempted) return "";

  const searchArgs = JSON.stringify(preflightLookup.toolArgs || {});
  if (preflightLookup.status === "found") {
    const rows = (preflightLookup.customers || []).map((customer: any) => {
      const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || "Unknown";
      const phones = [customer.phone, customer.mobile_phone].filter(Boolean).join(" / ");
      const address = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ");
      return `- ${name}${phones ? ` | ${phones}` : ""}${customer.email ? ` | ${customer.email}` : ""}${address ? ` | ${address}` : ""}`;
    });
    return `\n\nSERVER-VERIFIED CUSTOMER LOOKUP (latest user message):\nSearch args: ${searchArgs}\nRESULT: FOUND ${preflightLookup.count} CRM match(es). This lookup ran before the model responded and is authoritative. If a customer is listed here, NEVER say "no record found".\n${rows.join("\n")}`;
  }

  return `\n\nSERVER-VERIFIED CUSTOMER LOOKUP (latest user message):\nSearch args: ${searchArgs}\nRESULT: NO CRM MATCH FOUND from the preflight lookup. If you state that no record exists, only do so after honoring this lookup result and/or calling search_customer.`;
}

// ==================== Main handler ====================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
            const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const hcpApiKey = Deno.env.get("HCP_API_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = getSupabaseAdmin();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body = briefing mode */ }

    const mode = body.mode || "briefing";
    // Backend-only model router: ignore client model overrides and use the
    // normalized ai_model_config value as the actual OpenAI runtime model.
    const taskKey = mode === "briefing" ? "daily_briefing" : "copilot_chat";
    const configuredModel = await getTaskModel(sb, taskKey);
    let requestedModel = configuredModel;

    // Safety net: block stale provider-prefixed models that bypassed normalization.
    if (
      requestedModel.toLowerCase().startsWith("claude") ||
      requestedModel.toLowerCase().includes("anthropic") ||
      requestedModel.toLowerCase().startsWith("google/") ||
      requestedModel.toLowerCase().startsWith("gemini")
    ) {
      console.warn(`Blocked non-OpenAI model "${requestedModel}" in ai_model_config[${taskKey}] - using gpt-5-mini.`);
      requestedModel = "gpt-5-mini";
    }
    const callerMode = (body.mode || "").toLowerCase();

    // CRM tools (create_customer, create_job) are now inline in executeToolCall()

    // ========== EXISTING BRIEFING & CHAT MODES ==========

    // Validate keys
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Central Time variables — reliable manual offset (Intl timezone may silently return UTC in Deno)
    if (mode === "approved_action") {
      const actionItemId = body.approved_action_item_id;
      const token = body.approved_action_token;
      if (!actionItemId || !token) {
        return new Response(JSON.stringify({ error: "approved_action_item_id and approved_action_token are required." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: actionItem, error: actionErr } = await sb.from("action_items")
        .select("id, category, status, metadata")
        .eq("id", actionItemId)
        .maybeSingle();
      if (actionErr) throw actionErr;
      const metadata = actionItem?.metadata || {};
      if (
        !actionItem ||
        actionItem.category !== "jarvis_action_approval" ||
        actionItem.status !== "pending" ||
        metadata.approval_token !== token ||
        !metadata.tool_name ||
        !JARVIS_HITL_MUTATING_TOOLS.has(metadata.tool_name)
      ) {
        return new Response(JSON.stringify({ error: "Invalid or expired JARVIS approval action." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const toolResult = await executeToolCall(
        metadata.tool_name,
        metadata.tool_args || {},
        sb,
        supabaseUrl,
        supabaseKey,
        openaiApiKey,
        req,
        { actionItemId, token, metadata }
      );
      await sb.from("action_items")
        .update({
          status: "accepted",
          resolved_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            approved_at: new Date().toISOString(),
            approval_result: toolResult,
          },
        })
        .eq("id", actionItemId);
      await sb.from("activity_log").insert({
        action: "jarvis_action_approved",
        details: `Approved JARVIS action: ${metadata.tool_name}`,
        job_id: (metadata.tool_args || {}).job_id || null,
      });
      return new Response(JSON.stringify({ result: toolResult, tool_actions: [toolResult] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dayOfWeek, localDateStr, localTimeStr } = getCentralTimeStrings();

    // Load lean system prompt by assembling active prompt_sections
    // Sections with route_scope only load when the current page matches.
    const _pageCtxLower = (body.page_context || "").toLowerCase();
    const { data: promptSectionRows } = await sb
      .from("prompt_sections")
      .select("slug, title, content, route_scope, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order");

    const activeSections = (promptSectionRows || []).filter((s: any) => {
      if (!s.route_scope || !Array.isArray(s.route_scope) || s.route_scope.length === 0) return true;
      return s.route_scope.some((r: string) => _pageCtxLower.includes(String(r).toLowerCase()));
    });

    const assembledPrompt = activeSections
      .map((s: any) => `## ${s.title}\n${s.content}`)
      .join("\n\n");
    const systemPromptRow = assembledPrompt ? { value: assembledPrompt } : null;

    // ==================== ROUTE-AWARE CONTEXT LOADING ====================
    // Instead of loading ALL 32 data sources every request, only load what's relevant
    // to the user's current page and likely question. This dramatically reduces tokens
    // and prevents the model from hallucinating from irrelevant data.

    const pageContext = (body.page_context || "").toLowerCase();

    // Determine which context categories to load based on page
    type ContextCategory = "schedule" | "crm" | "comms" | "chat" | "parts" | "equipment" | "estimates" | "invoices" | "agreements" | "misc" | "workflow";

    function getNeededCategories(ctx: string, isBriefing: boolean): Set<ContextCategory> {
      // Briefing mode: broad view, but skip equipment matchups (huge token sink, ~15-20k tokens)
      if (isBriefing) return new Set(["schedule", "crm", "estimates", "invoices", "agreements", "workflow"]);

      // ALWAYS load only schedule. Everything else is opt-in by route or via tools.
      const cats = new Set<ContextCategory>(["schedule"]);

      if (ctx.includes("customer")) { cats.add("crm"); cats.add("invoices"); cats.add("agreements"); }
      if (ctx.includes("job") || ctx.includes("workflow")) { cats.add("invoices"); cats.add("workflow"); }
      if (ctx.includes("sms") || ctx.includes("call")) { cats.add("comms"); }
      if (ctx.includes("chat") || ctx.includes("team")) cats.add("chat");
      if (ctx.includes("part") || ctx.includes("catalog")) cats.add("parts");
      if (ctx.includes("estimate") || ctx.includes("quote") || ctx.includes("brochure")) { cats.add("estimates"); cats.add("equipment"); }
      if (ctx.includes("payment") || ctx.includes("invoice")) { cats.add("invoices"); }
      if (ctx.includes("agreement") || ctx.includes("plan") || ctx.includes("maintenance")) cats.add("agreements");
      if (ctx.includes("dispatch") || ctx.includes("mission") || ctx.includes("dashboard")) { cats.add("workflow"); }
      // NOTE: empty / copilot / generic context = ONLY schedule + always-on lightweight loads.
      // For customers/equipment, the agent uses search_customer / lookup_equipment tools.
      // This drops a typical generic copilot call from ~70k → ~10k tokens.
      return cats;
    }

    const needed = getNeededCategories(pageContext, mode !== "chat");

    // ALWAYS loaded: tasks, training, employees, company knowledge, schedule summary
    const [taskCtx, trainingContext, employees, companySettingsCtx, brandProfilesCtx, presentationSectionsCtx] = await Promise.all([
      getTaskContext(sb),
      getTrainingContext(sb),
      getEmployeesContext(sb),
      getCompanySettingsContext(sb),
      getBrandProfilesContext(sb),
      getPresentationSectionsContext(sb),
    ]);

    // Conditionally load context sources based on route
    const conditionalLoaders: Promise<string>[] = [];
    const conditionalLabels: string[] = [];

    function addLoader(label: string, loader: Promise<string>) {
      conditionalLabels.push(label);
      conditionalLoaders.push(loader);
    }

    if (needed.has("comms")) {
      addLoader("smsHistory", getSmsHistoryContext(sb));
      addLoader("callLog", getCallLogContext(sb));
      addLoader("voicemails", getVoicemailsContext(sb));
    }
    if (needed.has("chat")) {
      addLoader("chat", getChatContext(sb));
    }
    if (needed.has("parts")) {
      addLoader("parts", getPartsCatalogContext(sb));
    }
    if (needed.has("equipment")) {
      addLoader("equipment", getEquipmentMatchupsContext(sb));
      addLoader("jobEquipment", getJobEquipmentContext(sb));
      // NOTE: We intentionally do NOT load the flat getJobLineItemsContext() here.
      // The SCHEDULE SUMMARY already inlines line items per job (fetched in getScheduleSummaryContext).
      // Loading the flat dump too creates 500+ duplicate items that confuse the AI into picking
      // model numbers from the wrong job — the #1 cause of equipment hallucinations.
      addLoader("ahri", getAhriLookupsContext(sb));
      addLoader("warranty", getWarrantyContext(sb));
    }
    if (needed.has("crm")) {
      addLoader("customers", getCustomersContext(sb));
      addLoader("customerJobHistory", getCustomerJobHistoryContext(sb));
      addLoader("customerEquipment", getCustomerEquipmentContext(sb));
      addLoader("propertyData", getPropertyDataContext(sb));
    }
    if (needed.has("estimates")) {
      addLoader("estimates", getEstimatesContext(sb));
      addLoader("estimateReviews", getEstimateReviewsContext(sb));
      addLoader("techForms", getTechFormsContext(sb));
      addLoader("quotes", getQuotesContext(sb));
    }
    if (needed.has("invoices")) {
      addLoader("invoices", getInvoicesContext(sb));
      addLoader("customerInvoices", getCustomerInvoicesContext(sb));
    }
    if (needed.has("agreements")) {
      addLoader("maintenancePlans", getMaintenancePlansContext(sb));
    }
    // These are rarely needed and available via tools — only load for misc/broad requests
    if (needed.has("misc") || mode !== "chat") {
      addLoader("referrals", getReferralsContext(sb));
      addLoader("customerPhotos", getCustomerPhotosContext(sb));
    }
    // Workflow visibility — route-aware, NOT always-loaded
    if (needed.has("workflow")) {
      addLoader("actionItems", getActionItemsContext(sb));
      addLoader("outboundDrafts", getOutboundDraftsContext(sb));
      addLoader("jobReminders", getJobRemindersContext(sb));
    }
    // Always load lightweight context
    addLoader("smsTemplates", Promise.resolve((() => "")())); // templates loaded separately below
    addLoader("activityLog", getActivityLogContext(sb));
    // Always load todos — lightweight, always useful
    addLoader("todos", getTodosContext(sb));
    // Tech live locations + recent geofence events (lightweight, always useful for dispatch)
    addLoader("techLocations", (async () => {
      const [locsRes, eventsRes] = await Promise.all([
        sb.from("tech_locations").select("employee_id, lat, lng, speed, accuracy, updated_at"),
        sb.from("tech_location_events").select("employee_id, event_type, location_name, location_ref_id, created_at").order("created_at", { ascending: false }).limit(30),
      ]);
      const locs = locsRes.data || [];
      const events = eventsRes.data || [];
      if (locs.length === 0 && events.length === 0) return "";
      let ctx = "\n\nTECH LIVE LOCATIONS (GPS):\n";
      if (locs.length > 0) {
        // Join with employees to get names
        const empIds = locs.map((l: any) => l.employee_id);
        const { data: emps } = await sb.from("employees").select("id, name").in("id", empIds);
        const empMap: Record<string, string> = {};
        for (const e of (emps || [])) empMap[e.id] = e.name;
        for (const l of locs) {
          ctx += `- ${empMap[l.employee_id] || "Unknown"}: (${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}) updated ${l.updated_at}${l.speed ? ` speed:${l.speed.toFixed(1)}m/s` : ""}\n`;
        }
      }
      if (events.length > 0) {
        ctx += "\nRECENT GEOFENCE EVENTS:\n";
        const empIds2 = [...new Set(events.map((e: any) => e.employee_id))];
        const { data: emps2 } = await sb.from("employees").select("id, name").in("id", empIds2);
        const empMap2: Record<string, string> = {};
        for (const e of (emps2 || [])) empMap2[e.id] = e.name;

        // For on-site techs, enrich with job/customer context
        const arrivalEvents = events.filter((e: any) => e.event_type === "job_arrival" || e.event_type === "estimate_arrival");
        const jobRefIds = arrivalEvents.map((e: any) => e.location_ref_id).filter(Boolean);
        const jobCtxMap: Record<string, any> = {};
        if (jobRefIds.length > 0) {
          const { data: jobs } = await sb.from("jobs").select("id, customer_name, customer_id, address, job_type, hcp_job_number, job_number").in("id", jobRefIds);
          const { data: ests } = await sb.from("estimates").select("id, customer_name, customer_id, address, estimate_number").in("id", jobRefIds);
          for (const j of (jobs || [])) jobCtxMap[j.id] = j;
          for (const e of (ests || [])) jobCtxMap[e.id] = e;
        }

        for (const ev of events) {
          const techName = empMap2[ev.employee_id] || "Unknown";
          const jobCtx = ev.location_ref_id ? jobCtxMap[ev.location_ref_id] : null;
          if (jobCtx && (ev.event_type === "job_arrival" || ev.event_type === "estimate_arrival")) {
            const num = jobCtx.job_number || jobCtx.hcp_job_number || jobCtx.estimate_number || "";
            ctx += `- ${techName} is ON SITE at ${num ? "Job #" + num : "job"} (${jobCtx.customer_name || "Unknown"}, ${jobCtx.address || "no address"})${jobCtx.job_type ? " — " + jobCtx.job_type : ""} (${ev.created_at})\n`;
          } else {
            ctx += `- ${techName} ${ev.event_type} at "${ev.location_name}" (${ev.created_at})\n`;
          }
        }
      }
      return ctx;
    })());
    // Legacy taskTemplates context removed — workflow engine handles progression

    const conditionalResults = await Promise.all(conditionalLoaders);
    const contextMap: Record<string, string> = {};
    for (let i = 0; i < conditionalLabels.length; i++) {
      contextMap[conditionalLabels[i]] = conditionalResults[i];
    }

    // Load SMS templates separately (lightweight, always useful)
    const smsTemplates = await getSmsTemplatesContext(sb);

    // Build schedule summary from jobs already fetched
    const scheduleSummaryCtx = await getScheduleSummaryContext(sb, taskCtx.allJobs);
    const taskSummary = buildTaskSummary(taskCtx);

    // Log what was loaded for debugging
    const latestUserText = mode === "chat" ? getLatestUserMessageText(body.messages || []) : "";
    const customerLookupPreflight = mode === "chat" ? await preflightCustomerLookup(sb, latestUserText) : null;
    const customerLookupCtx = buildCustomerLookupContext(customerLookupPreflight);

    // RAG: embed user query and retrieve relevant knowledge chunks (hybrid search)
    // Features: source-aware routing, multi-query decomposition, per-customer context, feedback-aware ranking
    let ragContext = "";
    if (mode === "chat" && latestUserText && openaiApiKey) {
      try {
        // Detect intent for source-aware filtering
        const lowerText = latestUserText.toLowerCase();
        let filterSource: string | null = null;
        if (/\b(call|transcript|called|spoke|conversation)\b/.test(lowerText)) filterSource = "call_log";
        else if (/\b(text|sms|messag|thread)\b/.test(lowerText)) filterSource = "sms_log";
        else if (/\b(training|instruction|rule|policy|procedure)\b/.test(lowerText)) filterSource = "copilot_training";

        // Multi-query decomposition: extract sub-queries for complex questions
        const subQueries: string[] = [latestUserText];
        // If query mentions a customer name + topic, search both separately
        const nameMatch = lowerText.match(/\b(?:mrs?\.?|ms\.?)\s+(\w+)|(\w+)(?:'s?\s+(?:unit|system|ac|hvac|job|call|text|address|account))/i);
        if (nameMatch) {
          const name = nameMatch[1] || nameMatch[2];
          if (name && name.length > 2) subQueries.push(name);
        }
        // If query mentions equipment, add equipment-specific sub-query
        const equipMatch = lowerText.match(/\b(carrier|trane|lennox|goodman|rheem|york|amana|daikin|bryant)\b/i);
        if (equipMatch) subQueries.push(equipMatch[1]);

        // Embed all sub-queries through OpenAI directly.
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        const embedResp = openaiKey ? await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: subQueries, dimensions: 768 }),
        }) : null;

        if (embedResp && embedResp.ok) {
          const embedData = await embedResp.json();
          const allEmbeddings = (embedData.data || []).map((d: any) => d.embedding);

          // Extract keywords for hybrid search
          const stopwords = new Set(["the","and","for","are","but","not","you","all","can","had","her","was","one","our","out","has","have","this","that","with","from","they","been","said","each","which","their","will","other","about","many","then","them","these","some","would","make","like","just","over","such","take","year","also","into","could","than","only","come","made","after","back","through","most","where","much","should","well","what","when","your","very","know","here","does","want","need","how"]);
          const keywords = latestUserText.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter((w: string) => w.length >= 3 && !stopwords.has(w));
          const keywordQuery = keywords.length > 0 ? keywords.slice(0, 5).join(" ") : null;

          // Query for each sub-query embedding and merge results (dedup by chunk id)
          const seenIds = new Set<string>();
          const allMatches: any[] = [];
          const matchCountPerQuery = Math.max(1, Math.ceil(3 / Math.max(1, subQueries.length)));

          for (const embedding of allEmbeddings) {
            if (!embedding) continue;
            const { data: matches } = await sb.rpc("match_knowledge", {
              query_embedding: JSON.stringify(embedding),
              match_count: matchCountPerQuery,
              match_threshold: 0.55,
              filter_source: filterSource,
              keyword_query: keywordQuery,
            });
            for (const m of (matches || [])) {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                allMatches.push(m);
              }
            }
          }

          // Sort merged results by similarity descending, take top 10
          allMatches.sort((a: any, b: any) => b.similarity - a.similarity);
          const topMatches = allMatches.slice(0, 3);

          if (topMatches.length > 0) {
            ragContext = "\n\nRELEVANT KNOWLEDGE (hybrid semantic+keyword search" +
              (filterSource ? `, filtered to ${filterSource}` : "") +
              (subQueries.length > 1 ? `, ${subQueries.length} sub-queries merged` : "") +
              "):\n" +
              topMatches.map((m: any) => `[${m.source_table}${m.metadata?.phone ? " | " + m.metadata.phone : ""}${m.metadata?.customer_name ? " | " + m.metadata.customer_name : ""}] (relevance: ${(m.similarity * 100).toFixed(0)}%): ${m.chunk_text}`).join("\n\n");
            console.log(`RAG: ${topMatches.length} chunks for "${latestUserText.slice(0, 50)}..."${filterSource ? ` [${filterSource}]` : ""}${keywordQuery ? ` (kw: ${keywordQuery})` : ""} (${subQueries.length} queries)`);
          }
        }

        // Per-customer knowledge: if we detected a customer in preflight, pull their relevant chunks
        const preflightCustomer: any = customerLookupPreflight?.customers?.[0];
        if (preflightCustomer?.id) {
          try {
            const custPhone = preflightCustomer.phone || preflightCustomer.mobile_phone;
            if (custPhone) {
              const normalized = String(custPhone).replace(/\D/g, "").slice(-10);
              const { data: custChunks } = await sb
                .from("knowledge_chunks")
                .select("id, source_table, chunk_text, metadata, quality_score")
                .or(`metadata->>phone.like.%${normalized}%,metadata->>customer_name.ilike.%${preflightCustomer.first_name || ""}%`)
                .in("source_table", ["call_log", "sms_log"])
                .order("created_at", { ascending: false })
                .limit(2);
              if (custChunks && custChunks.length > 0) {
                const custName = [preflightCustomer.first_name, preflightCustomer.last_name].filter(Boolean).join(" ");
                ragContext += `\n\nCUSTOMER HISTORY CONTEXT (${custName}):\n` +
                  custChunks.map((c: any) => `[${c.source_table}]: ${c.chunk_text.slice(0, 500)}`).join("\n\n");
                console.log(`RAG: added ${custChunks.length} customer-specific chunks for ${custName}`);
              }
            }
          } catch (custRagErr) {
            console.warn("Customer RAG context failed (non-fatal):", custRagErr);
          }
        }
      } catch (ragErr) {
        console.warn("RAG query failed (non-fatal):", ragErr);
      }
    }

    // Stale chunk cleanup: run weekly (only on Monday briefings)
    if (mode === "briefing") {
      const dayNum = new Date().getUTCDay();
      if (dayNum === 1) { // Monday
        try {
          const { data: cleanupResult } = await sb.rpc("cleanup_stale_chunks", { months_old: 12 });
          if (cleanupResult && cleanupResult > 0) console.log(`RAG cleanup: removed ${cleanupResult} stale chunks`);
        } catch (e) { /* non-fatal */ }
      }
    }

    const loadedCategories = Array.from(needed).join(", ");
    console.log(`Context loaded for page="${pageContext}": [${loadedCategories}] (${conditionalLabels.length} sources)`);
  

    const employeeList = employees.length > 0
      ? "\n\nTEAM MEMBERS:\n" + employees.map((e: any) => 
          `- ${e.name} (${e.role}${e.phone ? ", phone: " + e.phone : ", no phone"}, ${e.is_active ? "active" : "inactive"}${e.home_address ? ", home: " + e.home_address : ""})`
        ).join("\n")
      : "\n\nNo employees configured yet.";

    // Build AGENT TOOLS section from enabled tools in the database
    const { data: enabledAgentTools } = await sb
      .from("agent_tools")
      .select("name, function_name, description")
      .eq("is_enabled", true)
      .order("name");
    const agentToolsSection = (enabledAgentTools && enabledAgentTools.length > 0)
      ? "\n\nAGENT TOOLS (enabled):\n" + enabledAgentTools.map((t: any) =>
          `- ${t.name} (${t.function_name}): ${t.description || "No description"}`
        ).join("\n")
      : "\n\nAGENT TOOLS: No tools enabled in the tools registry.";

    const ctx = (key: string) => contextMap[key] || "";

    const navigationLinksInstruction = `

NAVIGATION LINKS (ALWAYS use markdown links when referencing entities):
- Customer: [Customer Name](/customers/{customer_uuid})
- Job: [Job #1234](/jobs/{job_uuid})
- Estimate: [Est #5678](/estimates/{estimate_uuid})
Use the actual UUIDs from the data above. This makes entities clickable in the UI.
`;

    const runtimeData = `${companySettingsCtx}${brandProfilesCtx}${presentationSectionsCtx}${scheduleSummaryCtx}${trainingContext}
${employeeList}${agentToolsSection}${smsTemplates}${ctx("activityLog")}${ctx("todos")}${ctx("techLocations")}${ctx("taskTemplates")}${ctx("parts")}${ctx("invoices")}${ctx("smsHistory")}${ctx("callLog")}${ctx("equipment")}${ctx("jobEquipment")}${ctx("estimateReviews")}${ctx("techForms")}${ctx("maintenancePlans")}${ctx("customerEquipment")}${ctx("estimates")}${ctx("customers")}${ctx("customerJobHistory")}${ctx("customerPhotos")}${ctx("customerInvoices")}${ctx("chat")}${ctx("voicemails")}${ctx("warranty")}${ctx("quotes")}${ctx("referrals")}${ctx("propertyData")}${ctx("preinstallSurveys")}${ctx("ahri")}${ctx("actionItems")}${ctx("outboundDrafts")}${ctx("jobReminders")}
${customerLookupCtx}${ragContext}
${navigationLinksInstruction}
CURRENT TASK DATA:
${taskSummary}`;

    // Token estimate for monitoring (1 token ≈ 4 chars). Helps verify Phase A trim impact.
    const runtimeChars = runtimeData.length;
    const runtimeTokensEst = Math.round(runtimeChars / 4);
    console.log(`[token-budget] runtimeData: ${runtimeChars} chars ≈ ${runtimeTokensEst} tokens (page="${pageContext}", cats=[${loadedCategories}])`);

    // OUTPUT FORMAT REINFORCEMENT — placed at END of context for max recency.
    // PHASE B (dedup): Trimmed from 22 rules to 9 pure-formatting reminders.
    // Behavioral rules (booking language, smart-action buttons, dedup, paste-intake,
    // tone matching, multi-property, 5W cards, forbidden output tags) live in the DB
    // prompt — duplicating them here was a ~3k-token waste with zero behavior change.
    const outputFormatReinforcement = `

════════════════════════════════════════════════════════════
⚠️ OUTPUT FORMAT REMINDER (every response)
════════════════════════════════════════════════════════════
1. English only. Be concise, specific, actionable. Use job numbers AND customer names.
2. Markdown: **bold**, bullet lists, ### headers.
3. NEVER expose UUIDs or internal routes. Reference by friendly name: "Debbie Balsley" / "Job #8380".
4. Format: phone (XXX) XXX-XXXX, currency $X,XXX.XX. Today is ${dayOfWeek}, ${localDateStr}.
5. Task order: overdue → due today → upcoming pre-job → post-job → optional.
6. Schedules: include drive times.
7. Quotes: ONLY the :::equipment-card blocks from render_ready_cards, verbatim. No prose.
8. Emojis for scanability: 📋 ✅ ⚠️ 📅 💰 🔧 📞 💬.
9. Cite source URLs for web results. NEVER guess weekday — copy day name from data.
`;

    // Single code path — always read prompt from database
    const FALLBACK_PROMPT = "You are JARVIS, an internal HVAC dispatch assistant. The prompt_sections table has no active rules — please configure them in JARVIS Settings → System Prompt.";

    const rawPrompt = systemPromptRow?.value || FALLBACK_PROMPT;
    const systemPrompt = rawPrompt
      .replace(/\{\{dayOfWeek\}\}/g, dayOfWeek)
      .replace(/\{\{localDateStr\}\}/g, localDateStr)
      .replace(/\{\{localTimeStr\}\}/g, localTimeStr)
    + "\n" + runtimeData + `
═══════════════════════════════════════════
TOOL ROUTING RULES (follow strictly)
═══════════════════════════════════════════
• Customer lookup by name, phone, or email → ALWAYS use search_customer. Do NOT say "I don't have a record" or "not in our database" without calling search_customer first. If a user mentions a person's name, phone, or asks "do we have…", call search_customer immediately.
• Parts pricing, availability, or ordering → ALWAYS use invoke_supplyhouse or invoke_carrier_enterprise FIRST. These search YOUR supplier accounts with contractor pricing. Only fall back to web_search if both supplier tools fail or return no results.
• SupplyHouse.com: General HVAC parts (capacitors, contactors, fan motors, refrigerant, copper, fittings, filters, thermostats)
• Carrier Enterprise: Carrier/Bryant/Payne equipment, compressors, coils, OEM parts, warranty parts
• web_search: Regulations, codes, general knowledge, competitor research — NOT parts pricing
` + outputFormatReinforcement;
    console.log(`System prompt loaded from DB (${rawPrompt.length} chars)`);

    // Load employee names for dynamic tool hints
    const { data: empNamesRows } = await sb.from("employees").select("name").eq("is_active", true);
    const employeeNames = (empNamesRows || []).map((e: any) => e.name);
    const createJobTool = buildCreateJobTool(employeeNames);

    // Build a map of function_name → tool definition (deduplicated)
    const allToolsMap: Record<string, any> = {
      // Core orchestrator tools
      web_search: webSearchTool,
      scrape_url: scrapeUrlTool,
      update_instruction: updateInstructionTool,
      log_learning: logLearningTool,
      lookup_equipment: lookupEquipmentTool,
      verify_address: verifyAddressTool,
      // Communications
      send_sms_to_employee: sendSmsToEmployeeTool,
      send_tech_form_link: sendTechFormLinkTool,
      search_sms_history: searchSmsHistoryTool,
      search_call_history: searchCallHistoryTool,
      read_chat_messages: readChatMessagesTool,
      send_chat_message: sendChatMessageTool,
      // Sales docs
      create_quote: createQuoteTool,
      generate_install_quote: generateInstallQuoteTool,
      convert_estimate_to_job: convertEstimateToJobTool,
      generate_letterhead_document: generateLetterheadTool,
      // Scheduling
      get_travel_times: getTravelTimesTool,
      check_scheduling_fit: checkSchedulingFitTool,
      suggest_schedule_optimization: suggestScheduleOptimizationTool,
      // Customer CRM
      search_customer: searchCustomerTool,
      create_customer: createCustomerTool,
      update_customer: updateCustomerTool,
      create_job: createJobTool,
      // Specialists
      invoke_repair_quote: invokeRepairQuoteTool,
      invoke_supplyhouse: invokeSupplyhouseTool,
      invoke_carrier_enterprise: invokeCarrierEnterpriseTool,
      invoke_invoicing: invokeInvoicingTool,
      // Workflow
      update_job_field: updateJobFieldTool,
      create_parts_order: createPartsOrderTool,
      update_warranty_status: updateWarrantyStatusTool,
      // Live call transcript
      get_live_transcript: getLiveTranscriptTool,
      // Smart action buttons
      suggest_actions: suggestActionsTool,
      // Photo management
      move_photos_to_job: movePhotosToJobTool,
      // To-Do list
      create_todo: createTodoTool,
      complete_todo: completeTodoTool,
    };

    // ==================== PHASE C: ROUTE-AWARE TOOL FILTERING ====================
    // Only expose tools relevant to the current page. Saves ~3-5k tokens per call
    // by trimming ~40 full JSON tool definitions down to ~10-15. The agent can still
    // call any DB-enabled tool by name — but the model only "sees" the relevant ones.
    //
    // Tools always available (every page): search_customer, create_todo, complete_todo,
    // suggest_actions, web_search, lookup_equipment, verify_address.
    const ALWAYS_ON_TOOLS = new Set([
      "search_customer", "create_todo", "complete_todo", "suggest_actions",
      "web_search", "lookup_equipment", "verify_address",
      "update_instruction", "log_learning",
    ]);

    function getRouteTools(ctx: string): Set<string> {
      const t = new Set<string>(ALWAYS_ON_TOOLS);
      if (ctx.includes("customer") || ctx.includes("crm")) {
        ["create_customer", "update_customer", "create_job",
         "search_sms_history", "search_call_history"].forEach(x => t.add(x));
      }
      if (ctx.includes("job") || ctx.includes("workflow") || ctx.includes("dispatch") || ctx.includes("mission") || ctx.includes("dashboard")) {
        ["create_job", "update_job_field", "convert_estimate_to_job", "create_parts_order",
         "update_warranty_status", "get_travel_times", "check_scheduling_fit",
         "suggest_schedule_optimization", "send_tech_form_link", "send_sms_to_employee",
         "move_photos_to_job"].forEach(x => t.add(x));
      }
      if (ctx.includes("sms") || ctx.includes("call")) {
        ["search_sms_history", "search_call_history", "send_sms_to_employee",
         "get_live_transcript", "create_job", "create_customer"].forEach(x => t.add(x));
      }
      if (ctx.includes("chat") || ctx.includes("team")) {
        ["read_chat_messages", "send_chat_message"].forEach(x => t.add(x));
      }
      if (ctx.includes("part") || ctx.includes("catalog") || ctx.includes("supply")) {
        ["invoke_supplyhouse", "invoke_carrier_enterprise", "scrape_url"].forEach(x => t.add(x));
      }
      if (ctx.includes("estimate") || ctx.includes("quote") || ctx.includes("brochure") || ctx.includes("sales")) {
        ["create_quote", "generate_install_quote", "invoke_repair_quote", "convert_estimate_to_job",
         "generate_letterhead_document"].forEach(x => t.add(x));
      }
      if (ctx.includes("invoice") || ctx.includes("payment")) {
        ["invoke_invoicing", "create_quote"].forEach(x => t.add(x));
      }
      // Empty / generic / copilot context: load a balanced default set so the dispatcher
      // copilot stays useful for ad-hoc actions without exposing all 40 tools.
      if (!ctx || ctx.includes("copilot") || ctx.includes("jarvis")) {
        ["create_customer", "update_customer", "create_job", "update_job_field",
         "search_sms_history", "search_call_history",
         "send_sms_to_employee", "get_travel_times"].forEach(x => t.add(x));
      }
      return t;
    }

    // Read enabled tools from agent_tools table, then intersect with route-aware filter
    let chatTools: any[] | undefined;
    if (mode === "chat") {
      const { data: enabledTools } = await sb
        .from("agent_tools")
        .select("function_name")
        .eq("is_enabled", true);

      const enabledNames = enabledTools && enabledTools.length > 0
        ? new Set(enabledTools.map((t: any) => t.function_name))
        : new Set(Object.keys(allToolsMap)); // fallback: all tools enabled

      const routeAllowed = getRouteTools(pageContext);

      // Intersection: must be DB-enabled AND route-relevant
      const finalNames = ([...enabledNames] as string[]).filter((n) => routeAllowed.has(n));

      chatTools = finalNames
        .map((name) => (allToolsMap as any)[name])
        .filter(Boolean);

      console.log(`[tool-budget] tools exposed: ${chatTools.length}/${Object.keys(allToolsMap).length} (page="${pageContext}")`);
    }

    let messages: any[];
    if (mode === "chat") {
      const userMessages = body.messages || [];
      // Limit chat history to last 10 messages to prevent self-reinforcing hallucinations.
      const trimmedMessages = userMessages.slice(-10);
      const pageCtx = body.page_context ? `\n\nCURRENT PAGE CONTEXT: ${body.page_context}` : "";
      const dataAuthority = `\n\nDATA AUTHORITY REMINDER: The SCHEDULE SUMMARY, LINE ITEMS, and EQUIPMENT sections above are freshly loaded from the database RIGHT NOW. If any prior assistant messages in this conversation contradict this fresh data, the FRESH DATA wins. Always answer from the data above, never from your own prior messages.`;

      // ── JARVIS click-context payload ────────────────────────────────────
      // Sent ONCE on the first message of a triggered session (call/sms/voicemail
      // panel-open). Contains pre-resolved contact + recent history so the agent
      // does NOT need to call search_customer or lookup_recent_jobs again.
      const jc = body.jarvis_context;
      const jarvisContextBlock = jc
        ? `\n\nJARVIS CLICK-CONTEXT (already resolved — DO NOT re-look-up):\n${JSON.stringify(jc, null, 2)}\n\nUse this payload as the source of truth for who the user is interacting with. Skip search_customer / lookup_recent_jobs when the answer is already in this block. Only call tools to take action (send SMS, create job, etc.) — not to re-fetch data already provided here.`
        : "";

      messages = [
        { role: "system", content: systemPrompt + pageCtx + dataAuthority + jarvisContextBlock },
        ...trimmedMessages,
      ];
    } else {
      messages = [
        { role: "system", content: "You are an HVAC operations assistant. Be concise, specific, and actionable." },
        { role: "user", content: `${systemPrompt}\n\nProvide:\n1. A 2-3 sentence executive summary\n2. Top 3 risk flags (if any) with specific job references\n3. Suggested actions (max 5 bullet points)\n4. A one-line team performance note based on recent completions\n\nKeep it direct and actionable. Use job numbers and customer names. No fluff.` },
      ];
    }

    const useStream = mode === "chat" && body.stream;

    // --- OpenAI path ---
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const aiRequestBody: any = {
      model: requestedModel,
      messages,
      stream: false,
      max_completion_tokens: 8192,
    };
    if (chatTools) {
      aiRequestBody.tools = chatTools;
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiRequestBody),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      const isFallbackable = aiResponse.status >= 500;
      return new Response(
        JSON.stringify({
          error: isFallbackable ? "AI service temporarily unavailable. Please try again in a moment." : `AI gateway error (${aiResponse.status})`,
          fallback: isFallbackable,
        }),
        {
          status: isFallbackable ? 200 : aiResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const currentAiData = await aiResponse.json();
    const mainUsage = currentAiData.usage;
    const mainTokens = (mainUsage?.prompt_tokens || 0) + (mainUsage?.completion_tokens || 0);
    const mainInputTokens = mainUsage?.prompt_tokens || 0;
    const mainOutputTokens = mainUsage?.completion_tokens || 0;
    const mainCostCents = estimateCostCents({ model: requestedModel, inputTokens: mainInputTokens, outputTokens: mainOutputTokens });
    logApiUsage(sb, {
      service: "openai_ai",
      function_name: "ai-task-agent",
      endpoint: "chat/completions",
      tokens_used: mainTokens,
      input_tokens: mainInputTokens,
      output_tokens: mainOutputTokens,
      estimated_cost_cents: mainCostCents,
      metadata: { model: requestedModel, mode: callerMode || "chat" },
    });
    let currentMessage = currentAiData.choices?.[0]?.message;
    const allToolActions: any[] = [];
    let loopMessages = [...messages];
    let toolRounds = 0;
    const MAX_TOOL_ROUNDS = 5;

    // Multi-round tool loop
    while (currentMessage?.tool_calls && currentMessage.tool_calls.length > 0 && toolRounds < MAX_TOOL_ROUNDS) {
      const toolResults: any[] = [];
      
      for (const toolCall of currentMessage.tool_calls) {
        let toolArgs: any;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (parseErr) {
          console.error("Failed to parse tool arguments:", toolCall.function.arguments);
          toolResults.push({ status: "error", error: "Malformed tool arguments from AI" });
          allToolActions.push({ status: "error", error: "Malformed tool arguments" });
          continue;
        }
        const toolResult = await executeToolCall(toolCall.function.name, toolArgs, sb, supabaseUrl, supabaseKey, openaiApiKey, req);
        toolResults.push(toolResult);
        allToolActions.push(toolResult);
      }

      // Append assistant message + tool results to conversation
      loopMessages = [
        ...loopMessages,
        currentMessage,
        ...currentMessage.tool_calls.map((tc: any, i: number) => ({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResults[i] || { status: "skipped" }),
        })),
      ];

      // Call AI again with tool results — include tools so it can chain more calls
      const followUpBody: any = { model: requestedModel, messages: loopMessages };
      if (chatTools) followUpBody.tools = chatTools;

      let followUpResp: Response | null = null;
      for (let retryAttempt = 0; retryAttempt < 3; retryAttempt++) {
        followUpResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(followUpBody),
        });
        if (followUpResp.status === 429 && retryAttempt < 2) {
          const waitMs = (retryAttempt + 1) * 2000;
          console.warn(`OpenAI 429 rate limit, retrying in ${waitMs}ms (attempt ${retryAttempt + 1}/3)`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        break;
      }
      if (!followUpResp || !followUpResp.ok) {
        const errStatus = followUpResp?.status || "unknown";
        console.error("Tool follow-up error:", errStatus);
        // Hallucination guard: tell the user what actually happened
        const completedTools = allToolActions.map((a: any) => a.tool).join(", ");
        const failMsg = `I completed these actions: ${completedTools || "none"}, but then hit an error (${errStatus}) and could not finish the remaining steps. Please retry or complete the remaining actions manually.`;
        return new Response(JSON.stringify({ reply: failMsg, tool_actions: allToolActions.length > 0 ? allToolActions : undefined }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const followUpData = await followUpResp.json();
      const fuUsage = followUpData.usage;
      if (fuUsage) {
        const fuIn = fuUsage.prompt_tokens || 0;
        const fuOut = fuUsage.completion_tokens || 0;
        logApiUsage(sb, {
          service: "openai_ai",
          function_name: "ai-task-agent",
          endpoint: "chat/completions",
          tokens_used: fuIn + fuOut,
          input_tokens: fuIn,
          output_tokens: fuOut,
          estimated_cost_cents: estimateCostCents({ model: requestedModel, inputTokens: fuIn, outputTokens: fuOut }),
          metadata: { model: requestedModel, mode: callerMode || "chat", round: toolRounds + 1, tool_followup: true },
        });
      }
      currentMessage = followUpData.choices?.[0]?.message;
      toolRounds++;
    }

    // Extract suggested_actions from tool results
    const suggestedActions = allToolActions
      .filter((a: any) => a._suggested_actions)
      .flatMap((a: any) => a._suggested_actions);

    // If we executed tools, return the final text response
    if (allToolActions.length > 0) {
      const rawReply = currentMessage?.content || "Action completed.";
      const reply = rawReply
        .replace(/\[BOOKING_INTENT:\{[^}]*}\]/g, '')
        .replace(/\[confirm:(yes|no)\]/g, '')
        .replace(/\[INTAKE_PASTE\]/g, '')
        .trim() || "Action completed.";
      const responseBody: any = { reply, tool_actions: allToolActions };
      if (suggestedActions.length > 0) responseBody.suggested_actions = suggestedActions;
      return new Response(JSON.stringify(responseBody), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBriefing = currentMessage?.content || "No response generated.";
    const briefing = rawBriefing
      .replace(/\[BOOKING_INTENT:\{[^}]*}\]/g, '')
      .replace(/\[confirm:(yes|no)\]/g, '')
      .replace(/\[INTAKE_PASTE\]/g, '')
      .trim() || "No response generated.";

    if (mode === "chat") {
      return new Response(JSON.stringify({ reply: briefing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const overdueJobsL = (taskCtx.allJobs || []).filter((j: any) => j.scheduled_date && j.scheduled_date < taskCtx.today && j.status !== "done");
    const todayJobsL = (taskCtx.allJobs || []).filter((j: any) => j.scheduled_date === taskCtx.today);
    return new Response(
      JSON.stringify({
        briefing,
        stats: {
          overdue: overdueJobsL.length,
          dueToday: todayJobsL.length,
          totalPending: (taskCtx.allJobs || []).length,
          missingTasks: 0,
        },
        missingTasks: [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-task-agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
