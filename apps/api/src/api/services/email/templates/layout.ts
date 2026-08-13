import { EmailLocale } from "../types";

const SUPPORT_EMAIL = "support@vortexfinance.co";

// Served from the frontend's public/ directory. Email clients cannot render SVG and block
// data: URIs, so the mark has to be a hosted raster asset on an absolute HTTPS URL.
const MARK_URL = "https://www.vortexfinance.co/vortex-mark-email.png";

// Vortex design tokens from apps/frontend/App.css, converted to hex: email clients do not
// support oklch(), CSS custom properties, or <style> blocks, so every value is inlined.
// The *Bg tints have no token equivalent — they are the matching token hue at L=0.95, and
// every foreground/tint pair below clears WCAG AA (6.2:1, 7.1:1, 6.6:1).
const TOKENS = {
  base100: "#f5f9fa", // --color-base-100, page background
  base200: "#ffffff", // --color-base-200, card surface
  base300: "#e1e5ea", // --color-base-300, hairline border
  baseContent: "#374a5d", // --color-base-content, body text
  error: "#9f0712", // --color-error
  errorBg: "#ffe7e4",
  neutral: "#eff2f5", // --color-neutral, detail panel surface
  primary: "#0049c1", // --color-primary, brand blue
  success: "#016630", // --color-success
  successBg: "#e1f5e4",
  text: "#0b0b0b", // --text, headings and emphasised values
  warning: "#754d00", // --color-warning darkened for text use (token value is a fill, not a foreground)
  warningBg: "#fff0d4"
};

const TONES: Record<StatusTone, { fg: string; bg: string }> = {
  error: { bg: TOKENS.errorBg, fg: TOKENS.error },
  success: { bg: TOKENS.successBg, fg: TOKENS.success },
  warning: { bg: TOKENS.warningBg, fg: TOKENS.warning }
};

const FONT_STACK = "'Red Hat Display','Helvetica Neue',Helvetica,Arial,sans-serif";

// Tabular figures keep amounts, IDs and dates from shifting; ignored by clients that lack it.
const TABULAR = "font-variant-numeric:tabular-nums;font-feature-settings:'tnum';";

export type StatusTone = "error" | "success" | "warning";

export interface DetailRow {
  label: string;
  value: string;
}

export interface EmailBody {
  heading: string;
  intro: string;
  /** Rendered as a coloured pill above the heading. */
  status?: { label: string; tone: StatusTone };
  /** Promoted out of `details` and rendered as the focal value. */
  highlight?: DetailRow & { /** Widens tracking for one-time codes, which are read and retyped. */ code?: boolean };
  details: DetailRow[];
  outro: string;
  /** Rendered under the support address. Used by the auth emails for Terms/Privacy. */
  links?: { label: string; href: string }[];
}

export function formatDate(isoDate: string, locale: EmailLocale): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime())
    ? isoDate
    : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderStatus(status: EmailBody["status"]): string {
  if (!status) return "";
  const { fg, bg } = TONES[status.tone];
  return `<table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto 14px;">
                    <tr>
                      <td bgcolor="${bg}" style="background-color:${bg};border-radius:999px;padding:5px 12px;font-size:12px;line-height:1.2;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${fg};">${escapeHtml(status.label)}</td>
                    </tr>
                  </table>`;
}

function renderHighlight(highlight: EmailBody["highlight"]): string {
  if (!highlight) return "";
  // Letter-spacing appends a trailing space after the last glyph, so a centred code renders
  // half a tracking-unit left of true centre. text-indent shifts the line by half its value,
  // so indenting by the full tracking cancels it exactly (verified: 0.01px off centre).
  const value = highlight.code
    ? "font-size:34px;letter-spacing:0.22em;text-indent:0.22em;"
    : "font-size:38px;letter-spacing:-0.03em;";
  return `
              <tr>
                <td align="center" style="padding:0 32px 26px;">
                  <div style="font-size:13px;line-height:1.4;color:${TOKENS.baseContent};">${escapeHtml(highlight.label)}</div>
                  <div style="padding-top:6px;line-height:1.1;font-weight:700;color:${TOKENS.text};${value}${TABULAR}">${escapeHtml(highlight.value)}</div>
                </td>
              </tr>`;
}

function renderLinks(links: EmailBody["links"]): string {
  if (!links?.length) return "";
  const anchors = links
    .map(
      link =>
        `<a href="${escapeHtml(link.href)}" style="color:${TOKENS.baseContent};text-decoration:none;">${escapeHtml(link.label)}</a>`
    )
    .join(`<span style="color:${TOKENS.base300};"> &middot; </span>`);
  return `
                <p style="margin:16px 0 0;font-size:12px;line-height:1.6;">${anchors}</p>`;
}

function renderDetails(details: DetailRow[]): string {
  const lastIndex = details.length - 1;
  return details
    .map((row, index) => {
      const divider = index === lastIndex ? "" : `border-bottom:1px solid ${TOKENS.base300};`;
      return `
                        <tr>
                          <td style="${divider}padding:10px 12px 10px 0;font-size:13px;line-height:1.4;color:${TOKENS.baseContent};">${escapeHtml(row.label)}</td>
                          <td align="right" style="${divider}padding:10px 0;font-size:14px;line-height:1.4;font-weight:600;color:${TOKENS.text};${TABULAR}">${escapeHtml(row.value)}</td>
                        </tr>`;
    })
    .join("");
}

/**
 * Wraps a body in the shared Vortex email shell. Styles are inline because email
 * clients strip <style> blocks, and the layout is single-column light-mode only.
 */
export function renderHtml(body: EmailBody): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <!--[if mso]>
      <style>body,table,td,h1,p,a,div{font-family:Arial,Helvetica,sans-serif !important;}</style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:${TOKENS.base100};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;mso-line-height-rule:exactly;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${TOKENS.base100}" style="background-color:${TOKENS.base100};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
            <tr>
              <td align="center" style="padding:0 0 22px;">
                <img src="${MARK_URL}" width="44" height="44" alt="Vortex" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="background-color:${TOKENS.base200};border-radius:16px;box-shadow:0 1px 2px rgba(11,11,11,0.04),0 8px 24px rgba(11,11,11,0.06);">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center" style="padding:34px 32px 24px;">
                      ${renderStatus(body.status)}
                      <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${TOKENS.text};text-wrap:balance;">${escapeHtml(body.heading)}</h1>
                      <p style="margin:0;font-size:15px;line-height:1.6;color:${TOKENS.baseContent};text-wrap:pretty;">${escapeHtml(body.intro)}</p>
                    </td>
                  </tr>${renderHighlight(body.highlight)}
                  <tr>
                    <td style="padding:0 32px 30px;">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${TOKENS.neutral}" style="background-color:${TOKENS.neutral};border-radius:12px;">
                        <tr>
                          <td style="padding:6px 16px;">
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${renderDetails(body.details)}
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 16px 0;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:${TOKENS.baseContent};text-wrap:pretty;">${escapeHtml(body.outro)}</p>
                <p style="margin:6px 0 0;font-size:14px;line-height:1.6;">
                  <a href="mailto:${SUPPORT_EMAIL}" style="color:${TOKENS.primary};font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a>
                </p>${renderLinks(body.links)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderText(body: EmailBody): string {
  const rows = body.highlight ? [body.highlight, ...body.details] : body.details;
  const details = rows.map(row => `- ${row.label}: ${row.value}`).join("\n");
  return `${body.intro}\n\n${details}\n\n${body.outro}\n${SUPPORT_EMAIL}\n`;
}
