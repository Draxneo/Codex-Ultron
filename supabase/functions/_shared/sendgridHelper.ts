/**
 * Shared SendGrid Mail Send helper.
 * Uses the SendGrid v3 Mail Send API (JSON-based).
 */

const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";

export interface SendGridAttachment {
  content: string;      // base64-encoded
  filename: string;
  type: string;         // MIME type
  disposition?: string; // "attachment" | "inline"
}

export interface SendGridMessage {
  to: string[];
  cc?: string[];
  from: { email: string; name: string };
  replyTo?: { email: string; name?: string };
  subject: string;
  html?: string;
  text?: string;
  attachments?: SendGridAttachment[];
  headers?: Record<string, string>;
}

export async function sendViaSendGrid(
  apiKey: string,
  msg: SendGridMessage
): Promise<{ ok: boolean; statusCode: number; body: string }> {
  const personalizations: any = {
    to: msg.to.map((e) => ({ email: e })),
  };
  if (msg.cc && msg.cc.length > 0) {
    personalizations.cc = msg.cc.map((e) => ({ email: e }));
  }
  if (msg.headers) {
    personalizations.headers = msg.headers;
  }

  const payload: any = {
    personalizations: [personalizations],
    from: { email: msg.from.email, name: msg.from.name },
    subject: msg.subject,
    content: [],
  };

  // Reply-To
  if (msg.replyTo) {
    payload.reply_to = { email: msg.replyTo.email };
    if (msg.replyTo.name) payload.reply_to.name = msg.replyTo.name;
  }

  // Auto-generate plain text from HTML if no text provided
  if (!msg.text && msg.html) {
    try {
      const { htmlToPlainText } = await import("./emailLayout.ts");
      const autoText = htmlToPlainText(msg.html);
      if (autoText) payload.content.push({ type: "text/plain", value: autoText });
    } catch {
      // Fallback — don't break sends if import fails
    }
  }

  if (msg.text) payload.content.push({ type: "text/plain", value: msg.text });
  if (msg.html) payload.content.push({ type: "text/html", value: msg.html });
  if (payload.content.length === 0) {
    payload.content.push({ type: "text/plain", value: " " });
  }

  if (msg.attachments && msg.attachments.length > 0) {
    payload.attachments = msg.attachments.map((a) => ({
      content: a.content,
      filename: a.filename,
      type: a.type,
      disposition: a.disposition || "attachment",
    }));
  }

  const resp = await fetch(SENDGRID_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const respBody = resp.status === 202 ? "" : await resp.text();
  return { ok: resp.status === 202 || resp.ok, statusCode: resp.status, body: respBody };
}

/** Read SENDGRID_API_KEY + MAILGUN_DOMAIN (reusing domain for from address) */
export function getSendGridConfig() {
  const apiKey = Deno.env.get("SENDGRID_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN"); // still using same domain
  if (!apiKey) throw new Error("SENDGRID_API_KEY not configured");
  if (!domain) throw new Error("MAILGUN_DOMAIN not configured (used for sender domain)");
  return { apiKey, domain };
}
