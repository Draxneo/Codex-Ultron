function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return diff === 0;
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost");
}

function isLocalOrDevRequest(req: Request): boolean {
  const envName = (
    Deno.env.get("APP_ENV") ||
    Deno.env.get("ENVIRONMENT") ||
    Deno.env.get("NODE_ENV") ||
    Deno.env.get("SUPABASE_ENV") ||
    ""
  ).toLowerCase();
  if (["local", "development", "dev", "test"].includes(envName)) return true;

  const hostnames: string[] = [];
  try {
    hostnames.push(new URL(req.url).hostname);
  } catch {
    // ignore malformed request URL
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (supabaseUrl) {
    try {
      hostnames.push(new URL(supabaseUrl).hostname);
    } catch {
      // ignore malformed environment URL
    }
  }

  return hostnames.some(isLocalHostname);
}

/**
 * Validate Twilio request signature (X-Twilio-Signature header).
 * Prevents spoofed webhook calls. See:
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export async function validateTwilioSignature(
  req: Request,
  body: string,
): Promise<boolean> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    if (isLocalOrDevRequest(req)) {
      console.warn("TWILIO_AUTH_TOKEN not set in local/dev; skipping Twilio signature validation");
      return true;
    }

    console.error("TWILIO_AUTH_TOKEN not set outside local/dev; rejecting Twilio webhook");
    return false;
  }

  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature) {
    console.warn("Missing X-Twilio-Signature header");
    return false;
  }

  const internalUrl = new URL(req.url);
  const normalizedPath = internalUrl.pathname.startsWith("/functions/v1/")
    ? internalUrl.pathname
    : `/functions/v1${internalUrl.pathname.startsWith("/") ? "" : "/"}${internalUrl.pathname}`;

  const pathCandidates = Array.from(new Set([
    internalUrl.pathname,
    normalizedPath,
  ]));

  const baseCandidates = Array.from(new Set([
    internalUrl.origin,
    Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || "",
    (() => {
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") || "https";
      return host ? `${proto}://${host}` : "";
    })(),
    (() => {
      const host = req.headers.get("x-original-host");
      const proto = req.headers.get("x-forwarded-proto") || "https";
      return host ? `${proto}://${host}` : "";
    })(),
  ].filter(Boolean)));

  const rawQuery = internalUrl.search || "";
  const sortedQuery = internalUrl.searchParams.size > 0
    ? `?${
      Array.from(internalUrl.searchParams.entries())
        .sort(([aKey, aValue], [bKey, bValue]) => {
          if (aKey === bKey) return aValue.localeCompare(bValue);
          return aKey.localeCompare(bKey);
        })
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&")
    }`
    : "";

  const queryCandidates = Array.from(new Set([rawQuery, sortedQuery, ""]));
  const urlCandidates = Array.from(new Set(
    baseCandidates.flatMap((base) =>
      pathCandidates.flatMap((path) =>
        queryCandidates.map((query) => `${base}${path}${query}`)
      )
    ),
  ));

  const bodyParams = Array.from(new URLSearchParams(body).entries());
  const queryParams = Array.from(internalUrl.searchParams.entries());
  const paramCandidates = [
    bodyParams,
    [...bodyParams, ...queryParams],
  ].map((items) => items.sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  }));

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  for (const fullUrl of urlCandidates) {
    for (const params of paramCandidates) {
      let dataString = fullUrl;
      for (const [keyName, value] of params) {
        dataString += keyName + value;
      }

      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataString));
      const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

      if (constantTimeEqual(computed, signature)) {
        console.log(`Twilio signature validated for ${fullUrl}`);
        return true;
      }
    }
  }

  console.warn(`Twilio signature mismatch for ${urlCandidates.length} candidate URL(s). Got: ${signature}`);
  return false;
}
