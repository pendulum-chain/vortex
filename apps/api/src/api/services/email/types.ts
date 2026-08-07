export const SUPPORTED_LOCALES = ["en-US", "pt-BR"] as const;

export type EmailLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_EMAIL_LOCALE: EmailLocale = "en-US";

export function toEmailLocale(locale: string | null | undefined): EmailLocale {
  return SUPPORTED_LOCALES.includes(locale as EmailLocale) ? (locale as EmailLocale) : DEFAULT_EMAIL_LOCALE;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RampCompletedPayload {
  rampId: string;
  rampType: "buy" | "sell";
  // The fiat leg and the on-chain leg, already resolved to the user's perspective:
  // which side of the quote each one comes from depends on the ramp direction.
  fiatAmount: string;
  fiatCurrency: string;
  tokenAmount: string;
  tokenSymbol: string;
  network: string;
  completedAt: string;
}

export interface VerificationPayload {
  reason: string | null;
  updatedAt: string;
  // Absent on rows queued before the individual/business split; those read as individual,
  // which is the common case and the one the business-only copy was wrong for.
  subject?: VerificationSubject;
}

// Templates stay decoupled from the Notification model so they can be rendered
// (and previewed) without pulling in the database layer.
export type VerificationKind = "approved" | "expired" | "rejected";

// Whose verification it was: an individual's KYC or a company's KYB. Both arrive on the
// same Avenia attempts resource, so only our own customer record can tell them apart.
export type VerificationSubject = "business" | "individual";
