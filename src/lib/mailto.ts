/**
 * Build a `mailto:` URL pre-filled with subject/body.
 * Opens the user's default mail client (Gmail, Outlook, Apple Mail, etc.).
 *
 * Use this anywhere you want a "Send email" button — there is no in-app
 * email composer anymore.
 */
export function buildMailto(
  to: string | string[],
  opts: { subject?: string; body?: string; cc?: string | string[]; bcc?: string | string[] } = {},
): string {
  const toStr = Array.isArray(to) ? to.filter(Boolean).join(",") : to || "";
  const params = new URLSearchParams();
  if (opts.subject) params.set("subject", opts.subject);
  if (opts.body) params.set("body", opts.body);
  if (opts.cc) params.set("cc", Array.isArray(opts.cc) ? opts.cc.join(",") : opts.cc);
  if (opts.bcc) params.set("bcc", Array.isArray(opts.bcc) ? opts.bcc.join(",") : opts.bcc);
  const qs = params.toString().replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(toStr)}${qs ? `?${qs}` : ""}`;
}

/** Open a pre-filled email draft in the user's default mail client. */
export function openMailto(
  to: string | string[],
  opts: { subject?: string; body?: string; cc?: string | string[]; bcc?: string | string[] } = {},
) {
  window.location.href = buildMailto(to, opts);
}
