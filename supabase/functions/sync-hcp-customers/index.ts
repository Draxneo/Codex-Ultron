import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const HCP_BASE = "https://api.housecallpro.com";

async function processSync() {
  const apiKey = Deno.env.get("HCP_API_KEY");
  if (!apiKey) throw new Error("HCP_API_KEY not configured");

  const supabase = getSupabaseAdmin();

  // 1. Get all local customers with hcp_customer_id
  const BATCH = 1000;
  const localCustomers: { id: string; hcp_customer_id: string; address: string | null; email: string | null; phone: string | null; mobile_phone: string | null }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, hcp_customer_id, address, email, phone, mobile_phone")
      .not("hcp_customer_id", "is", null)
      .range(from, from + BATCH - 1);
    if (error) throw error;
    localCustomers.push(...(data || []));
    if (!data || data.length < BATCH) break;
    from += BATCH;
  }

  console.log(`Found ${localCustomers.length} local customers with HCP IDs`);

  const hcpMap = new Map(localCustomers.map(c => [c.hcp_customer_id, c]));

  let synced = 0;
  let addressesUpserted = 0;
  let contactsBackfilled = 0;
  let page = 1;

  // 2. Page through HCP customers
  while (true) {
    const url = `${HCP_BASE}/customers?page=${page}&page_size=200`;
    console.log(`Fetching HCP page ${page}...`);

    const resp = await fetch(url, {
      headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`HCP API error ${resp.status}: ${errText}`);
      break;
    }

    const json = await resp.json();
    const hcpCustomers = json.customers || [];

    if (hcpCustomers.length === 0) break;

    for (const hcpCust of hcpCustomers) {
      const local = hcpMap.get(hcpCust.id);
      if (!local) continue;

      // Backfill missing contact fields from HCP
      const backfillFields: Record<string, any> = {};

      if (!local.email && hcpCust.email) {
        backfillFields.email = hcpCust.email;
      }
      if (!local.phone && (hcpCust.home_number || hcpCust.work_number)) {
        backfillFields.phone = hcpCust.home_number || hcpCust.work_number;
      }
      if (!local.mobile_phone && hcpCust.mobile_number) {
        backfillFields.mobile_phone = hcpCust.mobile_number;
      }

      const addresses: any[] = hcpCust.addresses || [];
      const billingAddr = addresses.length > 0
        ? (addresses.find((a: any) => a.type === "billing") || addresses[0])
        : null;

      if (!local.address && billingAddr?.street) {
        backfillFields.address = billingAddr.street || null;
        backfillFields.city = billingAddr.city || null;
        backfillFields.state = billingAddr.state || null;
        backfillFields.zip = billingAddr.zip || null;
      }

      if (Object.keys(backfillFields).length > 0) {
        backfillFields.updated_at = new Date().toISOString();
        const { error: updateErr } = await supabase
          .from("customers")
          .update(backfillFields)
          .eq("id", local.id);

        if (!updateErr) contactsBackfilled++;
        else console.error(`Backfill error for ${local.id}:`, updateErr.message);
      }

      if (addresses.length === 0) { synced++; continue; }

      // Upsert all addresses into customer_addresses
      for (const addr of addresses) {
        if (!addr.id) continue;

        const isBilling = addr.type === "billing" || addr === billingAddr;
        const addressType = isBilling ? "billing" : "rental";

        const row = {
          customer_id: local.id,
          hcp_address_id: addr.id,
          address_type: addressType,
          is_primary: isBilling,
          street: addr.street || null,
          street_line_2: addr.street_line_2 || null,
          city: addr.city || null,
          state: addr.state || null,
          zip: addr.zip || null,
          latitude: addr.latitude || null,
          longitude: addr.longitude || null,
          updated_at: new Date().toISOString(),
        };

        const { error: upsertErr } = await supabase
          .from("customer_addresses")
          .upsert(row, { onConflict: "hcp_address_id" });

        if (upsertErr) {
          console.error(`Upsert error for address ${addr.id}:`, upsertErr.message);
        } else {
          addressesUpserted++;
        }
      }

      synced++;
    }

    const totalPages = json.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  const result = {
    ok: true,
    customers_processed: synced,
    addresses_upserted: addressesUpserted,
    contacts_backfilled: contactsBackfilled,
    hcp_pages_fetched: page,
  };

  console.log("Sync complete:", result);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("HCP_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "HCP_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Use waitUntil to run in background so the function doesn't time out
    const resultPromise = processSync();

    if (typeof (globalThis as any).EdgeRuntime !== "undefined" && (globalThis as any).EdgeRuntime.waitUntil) {
      (globalThis as any).EdgeRuntime.waitUntil(resultPromise.catch((err: any) => console.error("Background sync error:", err)));
      return new Response(JSON.stringify({ ok: true, message: "Sync started in background" }), {
        status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: await directly (may timeout for large datasets)
    const result = await resultPromise;
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-hcp-customers error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
