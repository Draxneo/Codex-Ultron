import { scrape, interact, stopInteract, getKey, esc } from "../_shared/firecrawl-v2.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



const PROFILE_NAME = "supplyhouse-contractor";

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
      const email = Deno.env.get("SUPPLYHOUSE_EMAIL");
      const password = Deno.env.get("SUPPLYHOUSE_PASSWORD");
      if (!email || !password) {
        return new Response(
          JSON.stringify({ success: false, error: "SUPPLYHOUSE_EMAIL or SUPPLYHOUSE_PASSWORD not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 1: Scrape homepage with persistent profile
      console.log("Creating SupplyHouse session with persistent profile...");
      const res = await scrape("https://www.supplyhouse.com", {
        formats: ["markdown"],
        waitFor: 3000,
        profile: { name: PROFILE_NAME, saveChanges: true },
      }, apiKey);

      if (!res.success || !res.scrapeId) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to scrape SupplyHouse", details: res.raw }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const scrapeId = res.scrapeId;

      // Check if we're already logged in (profile may have saved cookies)
      const isLoggedIn = res.markdown.includes("My Account") || res.markdown.includes("Sign Out") || res.markdown.includes("Hi,");

      let loginResult = "already_logged_in";

      if (!isLoggedIn) {
        // Step 2: Use interact to login via natural language
        console.log("Not logged in, using interact to sign in...");

        const step1 = await interact(scrapeId, {
          prompt: "Click the 'SIGN IN' button in the header to open the login dropdown or modal.",
          timeout: 15,
        }, apiKey);
        console.log("Sign in click:", step1.output?.slice(0, 200));

        const step2 = await interact(scrapeId, {
          prompt: `Fill in the email field with "${email}" and the password field with "${password}", then click the Sign In or Log In submit button.`,
          timeout: 30,
        }, apiKey);
        console.log("Login submit:", step2.output?.slice(0, 200));

        // Wait for login to complete
        const step3 = await interact(scrapeId, {
          prompt: "Wait for the page to load after login. Tell me if the login was successful by checking if there's a 'My Account' or user greeting visible.",
          timeout: 15,
        }, apiKey);

        loginResult = step3.output || "unknown";
      }

      // Get the live view URL from any interact call
      const liveViewUrl = res.raw?.data?.metadata?.liveViewUrl || null;

      return new Response(
        JSON.stringify({
          success: true,
          scrapeId,
          liveViewUrl,
          loginResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: search — search for a part using v2 scrape (public, no login needed)
    // =============================================
    if (action === "search") {
      const { query } = body;
      if (!query) {
        return new Response(
          JSON.stringify({ success: false, error: "query is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const searchUrl = `https://www.supplyhouse.com/sh/control/search/~SEARCH_STRING=${encodeURIComponent(query)}`;
      console.log("[search] Using v2 scrape for:", searchUrl);

      const res = await scrape(searchUrl, {
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
      }, apiKey);

      if (!res.success) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to scrape SupplyHouse search results", details: res.raw }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const markdown = res.markdown;
      console.log("[search] Got markdown, length:", markdown.length);

      // Parse product data from the markdown
      const results: any[] = [];
      const lines = markdown.split("\n");
      let currentProduct: any = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const productLink = line.match(/\[([^\]]+)\]\((https:\/\/www\.supplyhouse\.com\/[^\s)]+)\)/);
        if (productLink && productLink[1].length > 10 && !productLink[1].includes("Filter") && !productLink[1].includes("See More")) {
          if (currentProduct && currentProduct.name) results.push(currentProduct);
          currentProduct = { name: productLink[1], url: productLink[2], sku: "", brand: "", price: "", in_stock: false, total_available: "" };
        }
        if (currentProduct) {
          const skuMatch = line.match(/SKU:\s*\*?\*?([A-Za-z0-9-]+)\*?\*?/);
          if (skuMatch && !currentProduct.sku) currentProduct.sku = skuMatch[1];
          const brandMatch = line.match(/Brand:\s*\[?\*?\*?([^*\]]+)\*?\*?\]?/);
          if (brandMatch && !currentProduct.brand) currentProduct.brand = brandMatch[1].trim();
          const priceMatch = line.match(/\*?\*?\$(\d+\.?\d*)\*?\*?/);
          if (priceMatch && !currentProduct.price) currentProduct.price = "$" + priceMatch[1];
          if (line.includes("In Stock")) currentProduct.in_stock = true;
          const availMatch = line.match(/Total Available:\s*([\d,]+)/);
          if (availMatch) currentProduct.total_available = availMatch[1];
        }
        if (results.length >= 10) break;
      }
      if (currentProduct && currentProduct.name && results.length < 10) results.push(currentProduct);

      // Deduplicate
      const seen = new Set<string>();
      const uniqueResults = results.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });

      return new Response(
        JSON.stringify({ success: true, results: uniqueResults, source: "supplyhouse.com", pricing_note: "Public pricing shown. Login for contractor/TradeMaster discounts." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: add_to_cart — use interact on logged-in session
    // =============================================
    if (action === "add_to_cart") {
      const { scrape_id, product_url, quantity } = body;
      // Support both session_id (legacy) and scrape_id
      const sid = scrape_id || body.session_id;
      if (!sid || !product_url) {
        return new Response(
          JSON.stringify({ success: false, error: "scrape_id and product_url required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const qty = quantity || 1;

      // Navigate to product page via interact
      const navResult = await interact(sid, {
        code: `await page.goto("${esc(product_url)}", { waitUntil: "networkidle", timeout: 30000 }); await page.waitForTimeout(3000); JSON.stringify({ title: await page.title(), url: page.url() });`,
        timeout: 45,
      }, apiKey);

      // Set quantity and add to cart via prompt
      const cartResult = await interact(sid, {
        prompt: `Set the quantity to ${qty} and click the "Add to Cart" button. Confirm whether the item was added successfully.`,
        timeout: 30,
      }, apiKey);

      return new Response(
        JSON.stringify({ success: true, result: cartResult.output || cartResult.result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ACTION: text_support — SMS SupplyHouse for special parts
    // =============================================
    if (action === "text_support") {
      const { part_description, job_id } = body;
      if (!part_description) {
        return new Response(
          JSON.stringify({ success: false, error: "part_description required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: settingsRows } = await sb.from("company_settings").select("key, value");
      const settings: Record<string, string> = {};
      (settingsRows || []).forEach((r: any) => { settings[r.key] = r.value; });

      const companyName = settings.company_name || "Your Company";
      const companyPhone = settings.company_phone || "";
      const companyEmail = settings.company_email || Deno.env.get("SUPPLYHOUSE_EMAIL") || "";
      const message = `Hi, this is ${companyName}. I'm looking for a part and need help:\n\n${part_description}\n\nCan you check availability and pricing? My account email is ${companyEmail}.\n\nPlease reply to this number or call ${companyPhone}. Thank you!`;

      const smsResp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: "+18885517600", body: message }),
      });
      const smsResult = await smsResp.json();

      if (job_id) {
        await sb.from("activity_log").insert({
          job_id,
          action: "supplyhouse_inquiry",
          details: `Texted SupplyHouse support about: ${part_description.substring(0, 100)}`,
          performed_by: "ai-agent",
        });
      }

      return new Response(
        JSON.stringify({ success: smsResp.ok, smsResult, message: `Texted SupplyHouse support about: ${part_description}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}. Valid: create_session, search, add_to_cart, text_support` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("SupplyHouse agent error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
