import { getSendGridConfig, sendViaSendGrid } from "../_shared/sendgridHelper.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



/** Reuse the same Service Account JWT auth from sync-lsa-leads */
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/adwords",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    sub: sa.client_email,
  };

  const enc = (obj: any) => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const unsignedToken = `${enc(header)}.${enc(claims)}`;
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key,
    new TextEncoder().encode(unsignedToken)
  );

  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${unsignedToken}.${sigBase64}`;
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    throw new Error(`Token exchange failed: ${tokenResp.status}`);
  }
  return (await tokenResp.json()).access_token;
}

/** Pull total LSA ad spend from Google Ads campaign metrics */
async function getLsaAdSpend(): Promise<{ totalSpend: number; spendByMonth: { month: string; spend: number }[] }> {
  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID")?.replace(/-/g, "");
    const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.replace(/-/g, "");

    if (!saJson || !devToken || !customerId) {
      console.log("Google Ads credentials not configured, skipping spend data");
      return { totalSpend: 0, spendByMonth: [] };
    }

    const accessToken = await getAccessToken(saJson);

    // Query LSA campaign spend - use segments.date for filtering, segments.month for grouping
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        segments.month,
        metrics.cost_micros
      FROM campaign
      WHERE campaign.advertising_channel_type = 'LOCAL_SERVICES'
        AND metrics.cost_micros > 0
        AND segments.date BETWEEN '2024-01-01' AND '2026-12-31'
      ORDER BY segments.month DESC
    `;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": devToken,
      "Content-Type": "application/json",
    };
    if (loginCustomerId) {
      headers["login-customer-id"] = loginCustomerId;
    }

    const resp = await fetch(
      `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:searchStream`,
      { method: "POST", headers, body: JSON.stringify({ query }) }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Google Ads spend query error:", resp.status, errText);
      return { totalSpend: 0, spendByMonth: [] };
    }

    const data = await resp.json();
    const results = data?.[0]?.results || [];

    let totalSpend = 0;
    const monthMap = new Map<string, number>();

    for (const row of results) {
      const costMicros = parseInt(row.metrics?.costMicros || "0", 10);
      const costDollars = costMicros / 1_000_000;
      totalSpend += costDollars;

      const month = row.segments?.month || "Unknown";
      monthMap.set(month, (monthMap.get(month) || 0) + costDollars);
    }

    const spendByMonth = [...monthMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, spend]) => ({ month, spend }));

    return { totalSpend, spendByMonth };
  } catch (err) {
    console.error("Failed to fetch LSA spend:", err);
    return { totalSpend: 0, spendByMonth: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
            const supabase = getSupabaseAdmin();

    // Fetch LSA spend from Google Ads API in parallel with DB queries
    const spendPromise = getLsaAdSpend();

    // Get all LSA leads that have been converted/contacted and matched to a customer
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, first_name, last_name, phone, email, status, created_at, customer_id, lsa_lead_id, lsa_lead_type, lsa_category, notes, lsa_booked_notified")
      .eq("source", "google_lsa")
      .not("customer_id", "is", null)
      .order("created_at", { ascending: false });

    if (leadsErr) throw leadsErr;

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No matched LSA leads found", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get matched customer details
    const customerIds = [...new Set(leads.map((l: any) => l.customer_id).filter(Boolean))];
    const { data: customers } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, address, city")
      .in("id", customerIds);

    const customerMap = new Map((customers || []).map((c: any) => [c.id, c]));

    // Get revenue data: only for matched LSA customers (avoids 1000 row limit)
    const { data: revenueData } = await supabase
      .from("customer_invoices")
      .select("job_id, total, status, jobs!inner(customer_id)")
      .in("status", ["paid", "sent"])
      .in("jobs.customer_id", customerIds);

    // Build revenue per customer_id
    const revenueByCustomer = new Map<string, number>();
    for (const inv of revenueData || []) {
      const custId = (inv as any).jobs?.customer_id;
      if (custId) {
        revenueByCustomer.set(custId, (revenueByCustomer.get(custId) || 0) + (inv.total || 0));
      }
    }

    // Get company settings for email recipient
    const { data: settings } = await supabase
      .from("company_settings")
      .select("key, value")
      .in("key", ["company_email", "company_name"]);

    const companyEmail = settings?.find((s: any) => s.key === "company_email")?.value;
    const companyName = settings?.find((s: any) => s.key === "company_name")?.value || "Your Company";

    if (!companyEmail) {
      throw new Error("No company_email configured in company_settings");
    }

    // Wait for spend data
    const { totalSpend, spendByMonth } = await spendPromise;

    // Build HTML email
    let grandTotalRevenue = 0;
    const leadRows = leads.map((lead: any) => {
      const cust: any = customerMap.get(lead.customer_id);
      const custName = cust ? `${cust.first_name || ""} ${cust.last_name || ""}`.trim() : "—";
      const leadDate = lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
      const statusColor = lead.status === "converted" ? "#22c55e" : lead.status === "contacted" ? "#3b82f6" : "#6b7280";
      const alreadyReported = lead.lsa_booked_notified ? "✅" : "";
      const revenue = revenueByCustomer.get(lead.customer_id) || 0;
      grandTotalRevenue += revenue;
      const revenueStr = revenue > 0 ? `$${revenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; font-size: 14px;">${lead.first_name || ""} ${lead.last_name || ""}</td>
          <td style="padding: 10px 12px; font-size: 14px;">${lead.phone || "—"}</td>
          <td style="padding: 10px 12px; font-size: 14px;">${custName}</td>
          <td style="padding: 10px 12px; font-size: 14px;">${leadDate}</td>
          <td style="padding: 10px 12px; font-size: 14px;"><span style="color: ${statusColor}; font-weight: 600;">${lead.status}</span></td>
          <td style="padding: 10px 12px; font-size: 14px; font-weight: 600; color: ${revenue > 0 ? '#059669' : '#9ca3af'};">${revenueStr}</td>
          <td style="padding: 10px 12px; font-size: 14px; text-align: center;">${alreadyReported}</td>
        </tr>`;
    }).join("");

    const unreportedCount = leads.filter((l: any) => !l.lsa_booked_notified).length;
    const totalCount = leads.length;

    const grandTotalStr = `$${grandTotalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const totalSpendStr = `$${totalSpend.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const roi = totalSpend > 0 ? ((grandTotalRevenue / totalSpend) * 100).toFixed(0) : "∞";
    const profit = grandTotalRevenue - totalSpend;
    const profitStr = `$${profit.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const profitColor = profit >= 0 ? "#059669" : "#dc2626";

    // Monthly spend breakdown rows
    const spendRows = spendByMonth.length > 0 ? spendByMonth.map((m) => {
      const d = new Date(m.month + "-01");
      const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      return `<tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 12px; font-size: 14px;">${label}</td>
        <td style="padding: 8px 12px; font-size: 14px; font-weight: 600; color: #dc2626;">$${m.spend.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="2" style="padding: 8px 12px; font-size: 13px; color: #9ca3af;">Spend data unavailable</td></tr>`;

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f9fafb;">
        <div style="max-width: 960px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 24px 30px; color: white;">
            <h1 style="margin: 0; font-size: 22px;">🎯 LSA Leads → Customer Match Report</h1>
            <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${totalCount} matched leads (${unreportedCount} new)</p>
          </div>

          <!-- ROI Summary Banner -->
          <div style="display: flex; padding: 20px 30px; background: #f0fdf4; border-bottom: 1px solid #e5e7eb;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="text-align: center; padding: 8px 16px;">
                  <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Ad Spend</div>
                  <div style="font-size: 24px; font-weight: 700; color: #dc2626;">${totalSpendStr}</div>
                </td>
                <td style="text-align: center; padding: 8px 16px;">
                  <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Revenue</div>
                  <div style="font-size: 24px; font-weight: 700; color: #059669;">${grandTotalStr}</div>
                </td>
                <td style="text-align: center; padding: 8px 16px;">
                  <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Net Profit</div>
                  <div style="font-size: 24px; font-weight: 700; color: ${profitColor};">${profitStr}</div>
                </td>
                <td style="text-align: center; padding: 8px 16px;">
                  <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">ROI</div>
                  <div style="font-size: 24px; font-weight: 700; color: #2563eb;">${roi}%</div>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="padding: 20px 30px;">
            <p style="font-size: 14px; color: #374151; margin-bottom: 16px;">
              The following Google LSA leads have been matched to existing customers in your database. 
              Go to the <a href="https://ads.google.com/localservices" style="color: #2563eb; font-weight: 600;">Google LSA Portal</a> 
              and mark the matched ones as <strong>"Booked"</strong> so Google keeps sending quality leads.
            </p>

            <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">LSA Lead</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">Phone</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">Matched Customer</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">Lead Date</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">Status</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">Revenue</th>
                  <th style="padding: 10px 12px; text-align: center; font-size: 13px; color: #6b7280; font-weight: 600;">Reported</th>
                </tr>
              </thead>
              <tbody>
                ${leadRows}
                <tr style="background-color: #f0fdf4; font-weight: 700;">
                  <td colspan="5" style="padding: 12px; font-size: 14px; text-align: right;">Total LSA Revenue:</td>
                  <td style="padding: 12px; font-size: 16px; color: #059669;">${grandTotalStr}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>

            <!-- Monthly Spend Breakdown -->
            ${spendByMonth.length > 0 ? `
            <h3 style="margin: 24px 0 8px; font-size: 16px; color: #1f2937;">📊 Monthly LSA Ad Spend</h3>
            <table style="width: auto; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 8px 12px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">Month</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">Spend</th>
                </tr>
              </thead>
              <tbody>${spendRows}</tbody>
            </table>
            ` : ''}

            <div style="margin-top: 24px; text-align: center;">
              <a href="https://ads.google.com/localservices" 
                 style="display: inline-block; background: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Open Google LSA Portal →
              </a>
            </div>

            <p style="margin-top: 20px; font-size: 12px; color: #9ca3af; text-align: center;">
              This report was generated by ${companyName}'s CRM system.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email via SendGrid
    const { apiKey, domain } = getSendGridConfig();
    const result = await sendViaSendGrid(apiKey, {
      to: [companyEmail],
      from: { email: `service@${domain}`, name: `${companyName} CRM` },
      subject: `🎯 LSA Report: ${unreportedCount} leads | Spent ${totalSpendStr} → Made ${grandTotalStr} (${roi}% ROI)`,
      html,
    });

    if (!result.ok) {
      console.error("SendGrid error:", result.statusCode, result.body);
      throw new Error(`Email send failed: ${result.statusCode}`);
    }

    // Mark unreported leads as notified
    const unreportedIds = leads.filter((l: any) => !l.lsa_booked_notified).map((l: any) => l.id);
    if (unreportedIds.length > 0) {
      await supabase
        .from("leads")
        .update({ lsa_booked_notified: true })
        .in("id", unreportedIds);
    }

    console.log(`LSA booked report sent to ${companyEmail}: ${totalCount} leads, spend: ${totalSpendStr}, revenue: ${grandTotalStr}`);

    return new Response(
      JSON.stringify({ success: true, sent_to: companyEmail, total: totalCount, new_leads: unreportedCount, ad_spend: totalSpend, revenue: grandTotalRevenue }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("daily-lsa-booked-report error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
