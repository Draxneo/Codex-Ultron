/**
 * Validate Twilio request signature (X-Twilio-Signature header).
 * Prevents spoofed webhook calls. See:
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export async function validateTwilioSignature(
  req: Request,
  body: string
): Promise<boolean> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    console.warn("TWILIO_AUTH_TOKEN not set — skipping signature validation");
    return true; // Fail open if token not configured (dev mode)
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

  const urlCandidates = Array.from(new Set(
    baseCandidates.flatMap((base) => pathCandidates.map((path) => `${base}${path}${internalUrl.search}`))
  ));

  const params = Array.from(new URLSearchParams(body).entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  });

  // HMAC-SHA1 the data string with the auth token
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  for (const fullUrl of urlCandidates) {
    let dataString = fullUrl;
    for (const [keyName, value] of params) {
      dataString += keyName + value;
    }

    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataString));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

    if (computed === signature) {
      console.log(`Twilio signature validated for ${fullUrl}`);
      return true;
    }
  }

  console.warn(`Twilio signature mismatch for ${urlCandidates.length} candidate URL(s). Got: ${signature}`);
  return false;
}
