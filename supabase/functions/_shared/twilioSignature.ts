import { logSystemTrace } from "./systemTrace.ts";

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

function cleanBaseUrl(value: string | undefined): string {
  return (value || "").trim().replace(/\/$/, "");
}

function envUrl(name: string): string {
  return cleanBaseUrl(Deno.env.get(name));
}

function configuredWebhookUrlCandidates(pathCandidates: string[]): string[] {
  const slugs = pathCandidates
    .map((path) => path.split("/").filter(Boolean).at(-1) || "")
    .filter(Boolean);
  const slug = slugs[0] || "";

  const exactEnvNamesBySlug: Record<string, string[]> = {
    "voice-webhook": ["TWILIO_VOICE_WEBHOOK_URL"],
    "voice-ivr-handler": ["TWILIO_VOICE_IVR_HANDLER_URL"],
    "voice-status-callback": ["TWILIO_VOICE_STATUS_CALLBACK_URL"],
    "voice-voicemail": ["TWILIO_VOICE_VOICEMAIL_URL"],
    "sms-webhook": ["TWILIO_SMS_WEBHOOK_URL"],
    "sms-status-callback": ["TWILIO_SMS_STATUS_CALLBACK_URL"],
    "twilio-voice-twiml": ["TWILIO_VOICE_TWIML_URL"],
  };

  const exactUrls = (exactEnvNamesBySlug[slug] || [])
    .map(envUrl)
    .filter(Boolean);

  const publicBases = [
    envUrl("TWILIO_WEBHOOK_PUBLIC_BASE_URL"),
    envUrl("PUBLIC_SUPABASE_FUNCTIONS_URL"),
    envUrl("SUPABASE_FUNCTIONS_URL"),
  ].filter(Boolean);

  const baseUrls = publicBases.flatMap((base) =>
    pathCandidates.map((path) => `${base}${path}`)
  );

  return Array.from(new Set([...exactUrls, ...baseUrls]));
}

function maskSignature(signature: string): string {
  if (signature.length <= 12) return "[redacted]";
  return `${signature.slice(0, 6)}...${signature.slice(-6)}`;
}

function sourceNameFromPath(pathname: string): string {
  return pathname.split("/").filter(Boolean).at(-1) || "twilio-webhook";
}

type TwilioParamValue = string | string[];
type TwilioParams = Record<string, TwilioParamValue>;

function twilioParamsFromEntries(entries: [string, string][]): TwilioParams {
  const params: TwilioParams = {};

  for (const [name, value] of entries) {
    const existing = params[name];
    if (existing === undefined) {
      params[name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      params[name] = [existing, value];
    }
  }

  return params;
}

function twilioParamString(name: string, value: TwilioParamValue): string {
  if (Array.isArray(value)) {
    return Array.from(new Set(value))
      .sort()
      .map((item) => twilioParamString(name, item))
      .join("");
  }

  return name + value;
}

function twilioSignatureDataString(url: string, params: TwilioParams): string {
  return Object.keys(params)
    .sort()
    .reduce((acc, name) => acc + twilioParamString(name, params[name]), url);
}

function addStandardPortUrlVariants(url: string): string[] {
  try {
    const parsed = new URL(url);
    const variants = [url];

    if (!parsed.port && (parsed.protocol === "https:" || parsed.protocol === "http:")) {
      const withPort = new URL(url);
      withPort.port = parsed.protocol === "https:" ? "443" : "80";
      variants.push(withPort.toString());
    }

    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      const withoutPort = new URL(url);
      withoutPort.port = "";
      variants.push(withoutPort.toString());
    }

    return variants;
  } catch {
    return [url];
  }
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

  const requestParams = new URLSearchParams(body);

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
  const formEncodedQuery = internalUrl.searchParams.size > 0
    ? `?${internalUrl.searchParams.toString()}`
    : "";
  const percentSpaceQuery = formEncodedQuery
    ? formEncodedQuery.replace(/\+/g, "%20")
    : "";
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
  const sortedFormEncodedQuery = internalUrl.searchParams.size > 0
    ? `?${
      Array.from(internalUrl.searchParams.entries())
        .sort(([aKey, aValue], [bKey, bValue]) => {
          if (aKey === bKey) return aValue.localeCompare(bValue);
          return aKey.localeCompare(bKey);
        })
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, "+")}`)
        .join("&")
    }`
    : "";

  const queryCandidates = Array.from(new Set([
    rawQuery,
    formEncodedQuery,
    percentSpaceQuery,
    sortedQuery,
    sortedFormEncodedQuery,
    "",
  ]));
  const urlCandidates = Array.from(new Set(
    [
      ...configuredWebhookUrlCandidates(pathCandidates).flatMap((url) => {
        const parsed = new URL(url);
        const basePath = `${parsed.origin}${parsed.pathname}`;
        return queryCandidates.map((query) => `${basePath}${query}`);
      }),
      ...baseCandidates.flatMap((base) =>
        pathCandidates.flatMap((path) =>
          queryCandidates.map((query) => `${base}${path}${query}`)
        )
      ),
    ],
  ).flatMap(addStandardPortUrlVariants));

  const bodyParams = Array.from(requestParams.entries());
  const queryParams = Array.from(internalUrl.searchParams.entries());
  const paramCandidates: Array<{ mode: string; params: TwilioParams }> = [
    { mode: "body_object", params: twilioParamsFromEntries(bodyParams) },
    { mode: "body_plus_query_object", params: twilioParamsFromEntries([...bodyParams, ...queryParams]) },
  ];

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const diagnostics: Array<{
    url: string;
    paramMode: string;
    computedSignature: string;
  }> = [];

  for (const fullUrl of urlCandidates) {
    for (const paramCandidate of paramCandidates) {
      const dataString = twilioSignatureDataString(fullUrl, paramCandidate.params);

      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataString));
      const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
      if (diagnostics.length < 16) {
        diagnostics.push({
          url: fullUrl,
          paramMode: paramCandidate.mode,
          computedSignature: maskSignature(computed),
        });
      }

      if (constantTimeEqual(computed, signature)) {
        console.log(`Twilio signature validated for ${fullUrl}`);
        return true;
      }
    }
  }

  console.warn(JSON.stringify({
    message: "Twilio signature mismatch",
    path: internalUrl.pathname,
    requestUrl: req.url,
    candidateCount: urlCandidates.length,
    candidateUrls: urlCandidates.slice(0, 12),
    bodyParamKeys: Array.from(new Set(bodyParams.map(([key]) => key))).sort(),
    queryParamKeys: Array.from(new Set(queryParams.map(([key]) => key))).sort(),
    receivedSignature: maskSignature(signature),
  }));
  await logSystemTrace({
    sourceType: "voice",
    sourceName: sourceNameFromPath(internalUrl.pathname),
    eventKind: "twilio_signature_mismatch",
    summary: `Twilio signature mismatch on ${sourceNameFromPath(internalUrl.pathname)}`,
    reason: "invalid_twilio_signature",
    severity: "critical",
    traceGroup: requestParams.get("CallSid") || requestParams.get("MessageSid") || null,
    entityType: requestParams.get("CallSid") ? "call" : requestParams.get("MessageSid") ? "sms" : "twilio_webhook",
    entityId: requestParams.get("CallSid") || requestParams.get("MessageSid") || null,
    callSid: requestParams.get("CallSid"),
    metadata: {
      request_url: req.url,
      received_signature: maskSignature(signature),
      candidates: diagnostics,
      body_param_keys: Array.from(new Set(bodyParams.map(([keyName]) => keyName))).sort(),
      query_param_keys: Array.from(new Set(queryParams.map(([keyName]) => keyName))).sort(),
    },
  });
  return false;
}
