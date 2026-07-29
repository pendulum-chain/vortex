import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import { fetchWithTimeout } from "../../helpers/fetchWithTimeout";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY is not set; refusing to send email");
    this.name = "EmailNotConfiguredError";
  }
}

/**
 * Sends one email through Resend and returns the provider message id.
 * Throws on any non-2xx response so the caller can schedule a retry.
 */
export async function sendEmail(email: OutboundEmail): Promise<string> {
  const { apiKey, fromAddress, replyToAddress } = config.integrations.resend;

  if (!apiKey) {
    throw new EmailNotConfiguredError();
  }

  const response = await fetchWithTimeout(RESEND_EMAILS_URL, {
    body: JSON.stringify({
      from: fromAddress,
      html: email.html,
      ...(replyToAddress ? { reply_to: replyToAddress } : {}),
      subject: email.subject,
      text: email.text,
      to: [email.to]
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${body.slice(0, 500)}`);
  }

  try {
    const parsed = JSON.parse(body) as { id?: string };
    if (!parsed.id) {
      logger.warn("Resend accepted the email but returned no message id");
    }
    return parsed.id ?? "";
  } catch {
    logger.warn("Resend returned a non-JSON success body");
    return "";
  }
}
