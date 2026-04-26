/**
 * Builds a proxied URL for Twilio recording playback.
 * Twilio recording URLs require HTTP Basic Auth (Account SID + Auth Token),
 * so we route through our edge function which adds the credentials server-side.
 */
export function getRecordingProxyUrl(recordingUrl: string): string {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return `https://${projectId}.supabase.co/functions/v1/recording-proxy?url=${encodeURIComponent(recordingUrl)}`;
}
