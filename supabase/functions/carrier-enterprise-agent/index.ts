import { scrape, interact, stopInteract, getKey, esc } from "../_shared/firecrawl-v2.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



const PROFILE_NAME = "carrier-enterprise";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = getKey();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = getSupabaseAdmin();

  try {
    const body = await req.json();
    const { action } = body;

    // =============================================
    // ACTION: create_session — scrape+interact login with persistent profile
    // =============================================
    if (action === "create_session") {
      const email = Deno.env.get("CARRIER_ENTERPRISE_EMAIL");
      const password = Deno.env.get("CARRIER_ENTERPRISE_PASSWORD");
      if (!email || !password) {
        return new Response(
          JSON.stringify({ success: false, error: "CARRIER_ENTERPRISE_EMAIL or CARRIER_ENTERPRISE_PASSWORD not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Scrape CE sign-in page with persistent profile
      console.log("Creating CE session with persistent profile...");
      const res = await scrape("https://www.carrierenterprise.com/sign-in", {
        formats: ["markdown"],
        waitFor: 3000,
        profile: { name: PROFILE_NAME, saveChanges: true },
      }, apiKey);

      if (!res.success || !res.scrapeId) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to scrape CE", details: res.raw }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const scrapeId = res.scrapeId;

      // Check if already logged in
      const isLoggedIn = res.markdown.includes("My Account") || res.markdown.includes("Sign Out") ||
        (!res.markdown.includes("sign-in") && res.markdown.includes("carrierenterprise"));

      let loginResult = "already_logged_in";
      let liveViewUrl: string | null = null;

      if (!isLoggedIn) {
        // Step 1: Fill email and submit (Auth0 multi-step)
        console.log("Not logged in, using interact for Auth0 login...");
        const step1 = await interact(scrapeId, {
          prompt: `Fill the email field with "${email}" and click the Continue or Submit button.`,
          timeout: 20,
        }, apiKey);
        liveViewUrl = step1.liveViewUrl;

        // Step 2: Fill password and submit
        const step2 = await interact(scrapeId, {
          prompt: `Fill the password field with "${password}" and click the Log In or Continue button. Wait for the page to load.`,
          timeout: 30,
        }, apiKey);

        // Step 3: Handle account-pre-selector if needed
        const step3 = await interact(scrapeId, {
          prompt: "If there's an account selection page, click the first account option. Otherwise just confirm the current page URL and title.",
          timeout: 15,
        }, apiKey);

        loginResult = step3.output || step2.output || "login_attempted";
      }

      return new Response(
        JSON.stringify({ success: true, scrapeId, liveViewUrl, loginResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: search — search for a part on CE
    // =============================================
    if (action === "search") {
      const { query } = body;
      let scrapeId = body.scrape_id || body.session_id;

      if (!query) {
        return new Response(
          JSON.stringify({ success: false, error: "query is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Auto-create session if none provided
      if (!scrapeId) {
        console.log("[search] No session, auto-creating CE session...");
        const sessionResp = await fetch(`${supabaseUrl}/functions/v1/carrier-enterprise-agent`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create_session" }),
        });
        const sessionData = await sessionResp.json();
        if (!sessionData.success || !sessionData.scrapeId) {
          return new Response(
            JSON.stringify({ success: false, error: "Failed to auto-create CE session" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        scrapeId = sessionData.scrapeId;
      }

      // Navigate to search results via interact
      const searchResult = await interact(scrapeId, {
        code: `
          await page.goto("https://www.carrierenterprise.com/catalogsearch/result/?q=${encodeURIComponent(query)}", { waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(4000);
          const results = await page.evaluate(() => {
            const items = [];
            const productCards = document.querySelectorAll('.product-item, .product-item-info, [data-product-id]');
            if (productCards.length > 0) {
              for (const card of Array.from(productCards).slice(0, 10)) {
                const nameEl = card.querySelector('.product-item-link, .product-item-name a, .product-name a, h2 a, h3 a');
                const priceEl = card.querySelector('.price, .price-wrapper [data-price-amount], .special-price .price');
                const skuEl = card.querySelector('.product-sku, .sku, [class*="sku"]');
                const linkEl = card.querySelector('a[href*="/"]');
                const availEl = card.querySelector('.stock, .availability, [class*="stock"]');
                items.push({
                  name: nameEl ? nameEl.textContent.trim() : '',
                  price: priceEl ? priceEl.textContent.trim() : '',
                  sku: skuEl ? skuEl.textContent.trim().replace(/SKU:?\\s*/i, '') : '',
                  url: linkEl ? linkEl.href : '',
                  availability: availEl ? availEl.textContent.trim() : '',
                });
              }
            }
            return items.slice(0, 10);
          });
          JSON.stringify(results);
        `,
        timeout: 45,
      }, apiKey);

      let results: any[] = [];
      try { results = JSON.parse(searchResult.result || "[]"); } catch {}

      return new Response(
        JSON.stringify({ success: true, results, scrapeId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: add_to_cart
    // =============================================
    if (action === "add_to_cart") {
      const sid = body.scrape_id || body.session_id;
      const { product_url, quantity } = body;
      if (!sid || !product_url) {
        return new Response(
          JSON.stringify({ success: false, error: "scrape_id and product_url required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const qty = quantity || 1;

      await interact(sid, {
        code: `await page.goto("${esc(product_url)}", { waitUntil: "networkidle", timeout: 30000 }); await page.waitForTimeout(3000);`,
        timeout: 45,
      }, apiKey);

      const cartResult = await interact(sid, {
        prompt: `Set quantity to ${qty} and click the Add to Cart button. Confirm if the item was added.`,
        timeout: 30,
      }, apiKey);

      return new Response(
        JSON.stringify({ success: true, result: cartResult.output }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: check_pricing
    // =============================================
    if (action === "check_pricing") {
      const sid = body.scrape_id || body.session_id;
      const { product_url } = body;
      if (!sid || !product_url) {
        return new Response(
          JSON.stringify({ success: false, error: "scrape_id/session_id and product_url required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const priceResult = await interact(sid, {
        code: `
          await page.goto("${esc(product_url)}", { waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(3000);
          const pricing = await page.evaluate(() => {
            const result = { name: '', sku: '', price: '', listPrice: '', dealerPrice: '', availability: '' };
            const nameEl = document.querySelector('.page-title span, h1.product-name, h1 span');
            if (nameEl) result.name = nameEl.textContent.trim();
            const skuEl = document.querySelector('.product.attribute.sku .value, [itemprop="sku"]');
            if (skuEl) result.sku = skuEl.textContent.trim();
            const priceEls = document.querySelectorAll('.price, [data-price-amount]');
            const prices = Array.from(priceEls).map(el => el.textContent.trim()).filter(Boolean);
            if (prices.length > 0) result.price = prices[0];
            if (prices.length > 1) result.listPrice = prices[1];
            const dealerEl = document.querySelector('.dealer-price, .your-price, .special-price .price');
            if (dealerEl) result.dealerPrice = dealerEl.textContent.trim();
            const stockEl = document.querySelector('.stock, .availability, [class*="stock"]');
            if (stockEl) result.availability = stockEl.textContent.trim();
            return result;
          });
          JSON.stringify(pricing);
        `,
        timeout: 45,
      }, apiKey);

      let pricing: any = {};
      try { pricing = JSON.parse(priceResult.result || "{}"); } catch {}

      return new Response(
        JSON.stringify({ success: true, pricing }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: fetch_orders
    // =============================================
    if (action === "fetch_orders") {
      const sid = body.scrape_id || body.session_id;
      const { date_filter } = body;
      if (!sid) {
        return new Response(
          JSON.stringify({ success: false, error: "scrape_id/session_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date();
      let dateTo = now.toISOString().split("T")[0];
      let dateFrom = new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0];
      if (date_filter === "today") dateFrom = dateTo;
      else if (date_filter === "yesterday") { const yd = new Date(now.getTime() - 86400000); dateFrom = yd.toISOString().split("T")[0]; dateTo = dateFrom; }
      else if (body.date_from && body.date_to) { dateFrom = body.date_from; dateTo = body.date_to; }

      const ordersUrl = `https://www.carrierenterprise.com/orders?branch=All&dateFrom=${dateFrom}&dateMode=14&dateTo=${dateTo}&fulfillment=All&sortBy=ORDER_ID&sortDirection=DESC&status=All&searchScope=PO`;

      const ordersResult = await interact(sid, {
        code: `
          await page.goto("${esc(ordersUrl)}", { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(4000);
          const curUrl = page.url();
          if (curUrl.includes('sign-in') || curUrl.includes('login')) {
            JSON.stringify({ authFail: true, orders: [] });
          } else {
            if (curUrl.includes('account-pre-selector')) {
              const firstBtn = await page.$('button, a[href*="account"]');
              if (firstBtn) await firstBtn.click();
              await page.waitForTimeout(3000);
              await page.goto("${esc(ordersUrl)}", { waitUntil: "domcontentloaded", timeout: 30000 });
              await page.waitForTimeout(4000);
            }
            await page.waitForSelector('table tbody tr, [class*="order-row"], [class*="no-results"]', { timeout: 10000 }).catch(() => null);
            await page.waitForTimeout(2000);
            const orders = await page.evaluate(() => {
              const items = [];
              const headers = Array.from(document.querySelectorAll('table th, table thead td')).map(h => h.textContent?.trim() || '');
              const headerMap = {};
              headers.forEach((h, i) => { headerMap[h.toLowerCase()] = i; });
              const rows = document.querySelectorAll('table tbody tr');
              for (const row of Array.from(rows)) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) continue;
                const cellTexts = Array.from(cells).map(c => (c.textContent || '').trim());
                let orderNumber = '', orderUrl = '';
                for (const cell of Array.from(cells)) {
                  const link = cell.querySelector('a');
                  if (link) {
                    const href = link.getAttribute('href') || '';
                    const text = (link.textContent || '').trim();
                    if (/^\\d+/.test(text) && (href.includes('/orders/') || href.includes('/order/'))) {
                      orderNumber = text;
                      orderUrl = href.startsWith('http') ? href : 'https://www.carrierenterprise.com' + href;
                      break;
                    }
                  }
                }
                if (!orderNumber) orderNumber = cellTexts[0] || '';
                let po = '', date = '', status = '', total = '';
                const poIdx = headerMap['po'] ?? headerMap['po #'] ?? -1;
                const dateIdx = headerMap['date'] ?? headerMap['order date'] ?? -1;
                const statusIdx = headerMap['status'] ?? -1;
                const totalIdx = headerMap['total'] ?? headerMap['order total'] ?? -1;
                if (poIdx >= 0 && cells[poIdx]) po = (cells[poIdx].textContent || '').trim();
                if (dateIdx >= 0 && cells[dateIdx]) date = (cells[dateIdx].textContent || '').trim();
                if (statusIdx >= 0 && cells[statusIdx]) status = (cells[statusIdx].textContent || '').trim();
                if (totalIdx >= 0 && cells[totalIdx]) total = (cells[totalIdx].textContent || '').trim();
                if (!date || !total) {
                  for (const text of cellTexts) {
                    if (!date && (/\\d{4}-\\d{2}-\\d{2}/.test(text) || /\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}/.test(text))) date = text;
                    else if (!total && /\\$[\\d,]+\\.\\d{2}/.test(text)) total = text;
                  }
                }
                if (orderNumber) items.push({ orderNumber, orderUrl, date, status, po, total });
              }
              return items;
            });
            JSON.stringify({ authFail: false, orders });
          }
        `,
        timeout: 60,
      }, apiKey);

      let ordersData = { authFail: false, orders: [] as any[] };
      try { ordersData = JSON.parse(ordersResult.result || "{}"); } catch {}

      // Match POs to jobs
      const matchedOrders: any[] = [];
      for (const order of ordersData.orders) {
        if (!order.po) continue;
        const { data: jobMatch } = await sb
          .from("jobs")
          .select("id, job_number, customer_name, hcp_job_number")
          .or(`job_number.eq.${order.po},hcp_job_number.eq.${order.po}`)
          .limit(1);
        if (jobMatch && jobMatch.length > 0) {
          matchedOrders.push({ ...order, job_id: jobMatch[0].id, job_number: jobMatch[0].job_number || jobMatch[0].hcp_job_number, customer_name: jobMatch[0].customer_name });
        }
      }

      return new Response(
        JSON.stringify({ success: true, total_orders: ordersData.orders.length, matched_orders: matchedOrders, all_orders: ordersData.orders }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: fetch_order_detail
    // =============================================
    if (action === "fetch_order_detail") {
      const sid = body.scrape_id || body.session_id;
      const { order_url, job_id, ce_order_number } = body;
      if (!sid || !order_url) {
        return new Response(
          JSON.stringify({ success: false, error: "scrape_id and order_url required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const detailResult = await interact(sid, {
        code: `
          await page.goto("${esc(order_url)}", { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(6000);
          const lineItems = await page.evaluate(() => {
            const items = [];
            const rows = document.querySelectorAll('table tbody tr, [class*="order-item"] tr');
            for (const row of Array.from(rows)) {
              const cells = row.querySelectorAll('td');
              if (cells.length < 2) continue;
              const productCell = cells[0];
              const nameEl = productCell.querySelector('a, h3, h4, [class*="name"]');
              let productName = nameEl ? nameEl.textContent?.trim().split('\\n')[0] : '';
              if (!productName) productName = (productCell.textContent || '').split('\\n').map(l => l.trim()).filter(l => l.length > 3)[0] || '';
              if (!productName || productName.length < 3) continue;
              const fullText = productCell.textContent || '';
              const itemMatch = fullText.match(/Item[:#\\s]*([A-Z0-9][A-Z0-9\\-\\/]*?)(?=MFR|Serial|\\s*$)/i);
              const mfrMatch = fullText.match(/MFR[:#\\s]*([A-Z0-9][A-Z0-9\\-\\/]*?)(?=Serial|Item|\\s*$)/i);
              const serialMatch = fullText.match(/Serial\\s*(?:Number|No\\.?|#)?[:#\\s]*([A-Z0-9][A-Z0-9\\-]*)/i);
              const img = row.querySelector('img[src*="media"], img[src*="product"], img');
              const imageUrl = img ? (img.getAttribute('src') || '') : '';
              let quantity = '', price = '', subtotal = '';
              for (let i = 1; i < cells.length; i++) {
                const text = (cells[i]?.textContent || '').trim();
                if (text.toLowerCase().includes('reorder')) continue;
                if (/^\\d+$/.test(text) && !quantity) quantity = text;
                else if (/\\$/.test(text)) { const cleaned = text.replace(/[\\$,\\s]/g, ''); if (!price) price = cleaned; else subtotal = cleaned; }
              }
              items.push({ name: productName.substring(0, 200), itemNumber: itemMatch?.[1] || '', mfrNumber: mfrMatch?.[1] || '', serialNumber: serialMatch?.[1] || '', imageUrl, quantity: quantity || '1', price, subtotal });
            }
            return items;
          });
          JSON.stringify(lineItems);
        `,
        timeout: 60,
      }, apiKey);

      let lineItems: any[] = [];
      try { lineItems = JSON.parse(detailResult.result || "[]"); } catch {}

      // Store line items
      for (const item of lineItems) {
        if (job_id && ce_order_number) {
          await sb.from("ce_order_items").insert({
            job_id, ce_order_number: ce_order_number || "unknown",
            item_number: item.itemNumber || null, mfr_number: item.mfrNumber || null,
            description: item.name || null, serial_number: item.serialNumber || null,
            quantity: parseInt(item.quantity) || 1, unit_price: parseFloat(item.price) || 0,
            subtotal: parseFloat(item.subtotal) || 0, image_url: item.imageUrl || null,
          });
        }
        if (job_id && item.serialNumber) {
          await sb.from("job_equipment").upsert({
            job_id, serial_number: item.serialNumber, model_number: item.mfrNumber || item.itemNumber || null,
            equipment_type: "HVAC", brand: null, source: "carrier_enterprise", confidence: "high", is_confirmed: true,
          }, { onConflict: "job_id,serial_number" });
        }
      }

      return new Response(
        JSON.stringify({ success: true, line_items: lineItems, count: lineItems.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: import_orders — full pipeline
    // =============================================
    if (action === "import_orders") {
      let scrapeId = body.scrape_id || body.session_id;
      const { date_filter } = body;

      if (!scrapeId) {
        const sessionResp = await fetch(`${supabaseUrl}/functions/v1/carrier-enterprise-agent`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create_session" }),
        });
        const sessionData = await sessionResp.json();
        if (!sessionData.success) {
          return new Response(JSON.stringify({ success: false, error: "Failed to create CE session" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        scrapeId = sessionData.scrapeId;
      }

      const ordersResp = await fetch(`${supabaseUrl}/functions/v1/carrier-enterprise-agent`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch_orders", scrape_id: scrapeId, date_filter }),
      });
      const ordersData = await ordersResp.json();
      if (!ordersData.success) return new Response(JSON.stringify(ordersData), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const matched = ordersData.matched_orders || [];
      if (matched.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No orders matched to jobs", total_orders: ordersData.total_orders, all_orders: ordersData.all_orders }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const importResults: any[] = [];
      for (const order of matched) {
        if (!order.orderUrl) continue;
        const detailResp = await fetch(`${supabaseUrl}/functions/v1/carrier-enterprise-agent`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fetch_order_detail", scrape_id: scrapeId, order_url: order.orderUrl, job_id: order.job_id, ce_order_number: order.orderNumber }),
        });
        const detailData = await detailResp.json();
        importResults.push({ order_number: order.orderNumber, job_number: order.job_number, customer: order.customer_name, items_imported: detailData.count || 0, line_items: detailData.line_items || [] });
      }

      return new Response(
        JSON.stringify({ success: true, message: `Imported ${importResults.length} order(s)`, results: importResults }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: analyze_patterns
    // =============================================
    if (action === "analyze_patterns") {
      const { data: rawItems, error: rawErr } = await sb
        .from("ce_order_items")
        .select("item_number, mfr_number, description, quantity, unit_price, image_url, job_id, jobs!inner(job_type, system_type, orientation)")
        .not("item_number", "is", null);

      if (rawErr) return new Response(JSON.stringify({ success: false, error: rawErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!rawItems?.length) return new Response(JSON.stringify({ success: true, message: "No items to analyze", categories: 0, patterns: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const agg: Record<string, any> = {};
      const categoryJobCounts: Record<string, Set<string>> = {};

      for (const item of rawItems) {
        const job = (item as any).jobs;
        const cat = `${job?.job_type || "unknown"}:${job?.system_type || "unknown"}:${job?.orientation || "any"}`.toLowerCase();
        const key = `${cat}|${item.item_number}`;
        if (!categoryJobCounts[cat]) categoryJobCounts[cat] = new Set();
        categoryJobCounts[cat].add(item.job_id);
        if (!agg[key]) agg[key] = { job_type: job?.job_type || "unknown", system_type: job?.system_type || "unknown", orientation: job?.orientation || "any", item_number: item.item_number!, mfr_number: item.mfr_number || "", description: item.description || "", image_url: item.image_url || "", quantities: [], prices: [], jobIds: new Set() };
        agg[key].quantities.push(item.quantity || 1);
        agg[key].prices.push(item.unit_price || 0);
        agg[key].jobIds.add(item.job_id);
      }

      await sb.from("order_patterns").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const rows = Object.entries(agg).map(([key, v]) => {
        const cat = key.split("|")[0];
        return { category: cat, job_type: v.job_type, system_type: v.system_type, orientation: v.orientation, item_number: v.item_number, mfr_number: v.mfr_number, description: v.description, avg_quantity: Math.round((v.quantities.reduce((a: number, b: number) => a + b, 0) / v.quantities.length) * 10) / 10, avg_unit_price: Math.round((v.prices.reduce((a: number, b: number) => a + b, 0) / v.prices.length) * 100) / 100, frequency: v.jobIds.size, total_jobs_in_category: categoryJobCounts[cat]?.size || 0, image_url: v.image_url, updated_at: new Date().toISOString() };
      });

      let inserted = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error: insErr } = await sb.from("order_patterns").insert(batch);
        if (!insErr) inserted += batch.length;
      }

      return new Response(
        JSON.stringify({ success: true, message: `Analyzed ${rawItems.length} items, ${inserted} patterns`, categories: new Set(rows.map(r => r.category)).size, patterns: inserted }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: get_suggestions
    // =============================================
    if (action === "get_suggestions") {
      let { job_id, job_type: jt, system_type: st, orientation: ori } = body;
      if (job_id && (!jt || !st)) {
        const { data: job } = await sb.from("jobs").select("job_type, system_type, orientation").eq("id", job_id).single();
        if (job) { jt = jt || job.job_type; st = st || job.system_type; ori = ori || job.orientation; }
      }
      if (!jt || !st) return new Response(JSON.stringify({ success: false, error: "Need job_id or job_type + system_type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const cat = `${jt}:${st}:${ori || "any"}`.toLowerCase();
      let { data: patterns } = await sb.from("order_patterns").select("*").eq("category", cat).order("frequency", { ascending: false });
      if (!patterns?.length) {
        const fallback = `${jt}:${st}:any`.toLowerCase();
        const { data: p2 } = await sb.from("order_patterns").select("*").eq("category", fallback).order("frequency", { ascending: false });
        patterns = p2;
      }

      return new Response(
        JSON.stringify({ success: true, category: cat, suggestions: (patterns || []).map((p: any) => ({ item_number: p.item_number, mfr_number: p.mfr_number, description: p.description, avg_quantity: p.avg_quantity, avg_unit_price: p.avg_unit_price, frequency: p.frequency, total_jobs: p.total_jobs_in_category, confidence: p.total_jobs_in_category > 0 ? Math.round((p.frequency / p.total_jobs_in_category) * 100) : 0, image_url: p.image_url })) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("CE agent error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
