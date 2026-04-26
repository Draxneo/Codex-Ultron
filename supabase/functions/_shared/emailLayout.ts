/**
 * Shared branded email layout wrapper.
 * Produces a mobile-responsive, inline-CSS HTML email shell.
 * The tone is warm, personal, and confident — never stiff or corporate.
 */

export interface EmailLayoutOptions {
  /** Optional preview text (hidden pre-header) */
  previewText?: string;
  /** CTA button text + URL. Omit for no button. */
  cta?: { label: string; url: string };
  /** Company name override */
  companyName?: string;
  /** Subtitle under company name (e.g. "Air Conditioning & Heating"). Omit for none. */
  companySubtitle?: string;
  /** Company phone for footer */
  companyPhone?: string;
  /** Company city for footer */
  companyCity?: string;
  /** Company state for footer */
  companyState?: string;
}

const NAVY = "#1e3a5f";
const WARM_GRAY = "#f5f3f0";
const ACCENT = "#2563eb";
const TEXT = "#374151";
const LIGHT_TEXT = "#6b7280";

export function wrapInLayout(
  innerHtml: string,
  options: EmailLayoutOptions = {},
): string {
  const company = options.companyName || "Your Company";
  const previewText = options.previewText || "";
  const cta = options.cta;

  const ctaBlock = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px auto 12px; max-width: 100%;">
        <tr>
          <td align="center" style="background-color: ${ACCENT}; border-radius: 10px; box-shadow: 0 4px 14px rgba(37,99,235,0.35);">
            <a href="${cta.url}" target="_blank"
              style="display: inline-block; padding: 18px 48px; color: #ffffff; font-family: Arial, sans-serif; font-size: 18px; font-weight: 700; text-decoration: none; border-radius: 10px; letter-spacing: 0.3px;">
              ${cta.label}
            </a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${company}</title>
  <!--[if mso]><style>table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${WARM_GRAY}; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>` : ""}

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${WARM_GRAY};">
    <tr>
      <td align="center" style="padding: 24px 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background-color: ${NAVY}; padding: 24px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
                ${company}
              </h1>
              ${options.companySubtitle ? `<p style="margin: 4px 0 0; color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 400;">
                ${options.companySubtitle}
              </p>` : ""}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 24px; color: ${TEXT}; font-size: 15px; line-height: 1.6;">
              ${innerHtml}
              ${ctaBlock}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${WARM_GRAY}; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e1dc;">
              <p style="margin: 0; font-size: 12px; color: ${LIGHT_TEXT}; line-height: 1.5;">
                ${company} · ${options.companyCity || "San Antonio"}, ${options.companyState || "TX"}<br/>
                ${options.companyPhone ? `<a href="tel:${options.companyPhone.replace(/\D/g, '')}" style="color: ${LIGHT_TEXT}; text-decoration: none;">${options.companyPhone}</a>` : ""}
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Strip HTML to produce a readable plain-text version.
 * Converts <a> to "text (url)", <br> to newlines, strips all other tags.
 */
export function htmlToPlainText(html: string): string {
  let text = html;
  // Convert <br>, </p>, </div>, </tr> to newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|h[1-6])>/gi, "\n");
  // Convert links to "text (url)" format
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  // Collapse whitespace, trim lines
  text = text.replace(/[ \t]+/g, " ");
  text = text.split("\n").map((l) => l.trim()).join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
