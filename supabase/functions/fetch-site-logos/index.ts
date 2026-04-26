import { scrape, getKey } from "../_shared/firecrawl-v2.ts";import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { urls } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'urls array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = getKey();
    console.log(`Fetching logos for ${urls.length} sites`);

    const results: Record<string, string | null> = {};

    // Process in parallel with a concurrency limit of 3
    const batchSize = 3;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const promises = batch.map(async (url: string) => {
        try {
          console.log(`Scraping branding for: ${url}`);

          const res = await scrape(url, {
            formats: ['branding'],
            onlyMainContent: true,
            profile: { name: 'site-logos', saveChanges: false },
          }, apiKey);

          if (!res.success) {
            console.error(`Failed for ${url}`);
            results[url] = null;
            return;
          }

          // Extract logo from branding response
          const branding = res.branding || res.raw?.data?.branding;
          const logo = branding?.logo || branding?.images?.logo || branding?.images?.favicon || null;
          
          console.log(`Logo for ${url}: ${logo}`);
          results[url] = logo;
        } catch (err) {
          console.error(`Error scraping ${url}:`, err);
          results[url] = null;
        }
      });

      await Promise.all(promises);
    }

    return new Response(
      JSON.stringify({ success: true, logos: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching logos:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch logos' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
