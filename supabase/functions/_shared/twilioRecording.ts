/**
 * Fetch a Twilio recording with HTTP Basic Auth.
 * Since July 2023, Twilio enforces authentication on all recording URLs.
 * Without this, fetches return 401 or a login page.
 */
export async function fetchRecordingWithAuth(recordingUrl: string): Promise<ArrayBuffer | null> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!accountSid || !authToken) {
    console.error("fetchRecordingWithAuth: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set");
    return null;
  }

  const audioUrl = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;

  const resp = await fetch(audioUrl, {
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
    },
  });

  if (!resp.ok) {
    console.error(`fetchRecordingWithAuth: HTTP ${resp.status} for ${audioUrl}`);
    return null;
  }

  return resp.arrayBuffer();
}

/**
 * Base64-encode helper for Deno (compatible with btoa but works on binary).
 */
function btoa(str: string): string {
  return globalThis.btoa(str);
}
