/**
 * Universal email cleaning utilities.
 *
 * Pure functions for normalizing email content for display anywhere:
 *  - Inbox lists (snippets)
 *  - Thread previews
 *  - Subject rows
 *  - AI summary input
 *  - Activity feeds
 *
 * Handles:
 *  - Mojibake / mis-encoded UTF-8
 *  - Quoted-printable remnants (=3D, =20, soft line breaks)
 *  - HTML accidentally stored in body_text
 *  - Base64-encoded bodies
 *  - Empty bodies → graceful fallback
 */

/* ── Mojibake repair (UTF-8 double-encoded as Latin-1) ── */
export function repairMisencodedUtf8(text: string): string {
  if (!text) return text;
  if (/[\xC2-\xDF][\x80-\xBF]/.test(text) && /â€/.test(text)) {
    try {
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (!decoded.includes("\uFFFD")) return decoded;
    } catch { /* fall through */ }
  }
  return text;
}

/* ── Quoted-printable remnant cleanup ── */
export function decodeQpRemnants(text: string): string {
  if (!text) return text;
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=3D/gi, "=")
    .replace(/=20/g, " ")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/* ── Detect if a string is really HTML ── */
export function looksLikeHtml(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (/^<!doctype\s/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return true;
  const tagCount = (trimmed.match(/<\/?[a-z][\w-]*[\s>]/gi) || []).length;
  return tagCount >= 3;
}

/* ── Detect base64-encoded body ── */
export function looksLikeBase64(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return /^[A-Za-z0-9+/\s]+=*$/.test(trimmed) && trimmed.length > 100;
}

export function decodeBase64(text: string): string {
  try {
    return atob(text.replace(/\s/g, ""));
  } catch {
    return text;
  }
}

/* ── Strip HTML to plain text ── */
export function stripHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Auto-link URLs in plain text (returns HTML) ── */
export function autoLinkUrls(text: string): string {
  if (!text) return "";
  return text.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline break-all">$1</a>'
  );
}

/* ── Sanitize HTML (basic — remove scripts, event handlers) ── */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "");
}

/* ── Main detection & normalization ── */
export interface ProcessedBody {
  html: string | null;
  text: string | null;
  format: "html" | "plaintext";
}

export function processEmailBody(
  bodyText?: string | null,
  bodyHtml?: string | null
): ProcessedBody {
  let text = bodyText ? repairMisencodedUtf8(bodyText) : null;
  let html = bodyHtml ? repairMisencodedUtf8(bodyHtml) : null;

  if (text) text = decodeQpRemnants(text);
  if (html) html = decodeQpRemnants(html);

  if (text && looksLikeBase64(text)) {
    const decoded = decodeBase64(text);
    if (looksLikeHtml(decoded)) {
      html = decoded;
      text = stripHtmlToText(decoded);
    } else {
      text = decoded;
    }
  }

  if (!html && text && looksLikeHtml(text)) {
    html = text;
    text = stripHtmlToText(html);
  }

  if (html) {
    html = sanitizeHtml(html);
    return { html, text, format: "html" };
  }

  if (text) {
    return { html: null, text, format: "plaintext" };
  }

  return { html: null, text: null, format: "plaintext" };
}

/* ── Convenience: clean subject line ── */
export function cleanSubject(subject?: string | null): string {
  if (!subject) return "(no subject)";
  return repairMisencodedUtf8(decodeQpRemnants(subject))
    .replace(/\s+/g, " ")
    .trim() || "(no subject)";
}

/* ── Convenience: clean snippet (plain text, truncated) ── */
export function cleanForSnippet(
  bodyText?: string | null,
  bodyHtml?: string | null,
  snippet?: string | null,
  maxLen = 140
): string {
  // Prefer existing snippet if it's clean-looking
  if (snippet && snippet.length > 0 && !looksLikeHtml(snippet)) {
    const cleaned = repairMisencodedUtf8(decodeQpRemnants(snippet))
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length > 0) {
      return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + "…" : cleaned;
    }
  }

  const processed = processEmailBody(bodyText, bodyHtml);
  let text = processed.text || "";
  if (!text && processed.html) {
    text = stripHtmlToText(processed.html);
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "(no preview)";
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

/* ── Convenience: clean for AI input (plain text, larger limit) ── */
export function cleanForAi(
  bodyText?: string | null,
  bodyHtml?: string | null,
  maxLen = 8000
): string {
  const processed = processEmailBody(bodyText, bodyHtml);
  let text = processed.text || "";
  if (!text && processed.html) {
    text = stripHtmlToText(processed.html);
  }
  text = text.trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "\n[...truncated]" : text;
}

/* ── Convenience: clean display HTML (sanitized, ready for iframe/dangerouslySetInnerHTML) ── */
export function cleanForDisplay(
  bodyText?: string | null,
  bodyHtml?: string | null
): ProcessedBody {
  return processEmailBody(bodyText, bodyHtml);
}
