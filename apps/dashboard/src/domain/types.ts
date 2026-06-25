/**
 * Mocked onboarding domain for the Vortex dashboard.
 *
 * Status values are a unified projection of the real Vortex provider enums so
 * this layer is swappable for the live integrations later:
 *   - Avenia (Brazil/BRL): KycAttemptStatus (PENDING|PROCESSING|COMPLETED|EXPIRED)
 *     + KycAttemptResult (APPROVED|REJECTED)
 *   - Mykobo (Europe/EURC): MykoboCustomerStatus (CONSULTED|PENDING|APPROVED|REJECTED)
 */

export type OnboardingStatus = "not_started" | "pending" | "in_review" | "approved" | "rejected";

export type CorridorId = "BR" | "EU" | "MX" | "CO" | "US" | "AR";

export type OnboardingKind = "kyb" | "kyc";

export type AccountType = "company" | "individual";

/** How an onboarding is completed: inline wizard, an external Google Form, or a partner redirect. */
export type OnboardingRoute = "headless" | "google_form" | "redirect";

export type RecipientStatus = "invite_sent" | "pending" | "approved" | "rejected";

export type RecipientMethod = "pix" | "iban" | "spei" | "ach";

export type KycProvider = "avenia" | "mykobo" | "alfredpay";

/** Brazil & Europe are live; Alfredpay corridors are selectable but not yet verifiable. */
export type CorridorAvailability = "live" | "coming_soon";

export interface Corridor {
  id: CorridorId;
  name: string;
  flag: string;
  currency: string;
  provider: KycProvider;
  availability: CorridorAvailability;
  recipientMethod: RecipientMethod;
  recipientLabel: string;
}

export interface Onboarding {
  corridorId: CorridorId;
  kind: OnboardingKind;
  status: OnboardingStatus;
  updatedAt: string;
}

export interface SenderAccount {
  id: string;
  name: string;
  type: AccountType;
  /** CNPJ for companies, CPF/email handle for individuals — display only. */
  identifier: string;
  /** Corridors this account chose to track; only these show on the dashboard. */
  selectedCorridors: CorridorId[];
  /** Populated only for selected corridors. */
  onboardings: Partial<Record<CorridorId, Onboarding>>;
}

/** Wallet-to-fiat payout lifecycle: fund the payin wallet, then settle to the recipient bank. */
export type TransactionStatus = "awaiting_payin" | "processing" | "completed" | "failed";

export interface Transaction {
  id: string;
  accountId: string;
  recipientId: string;
  /** Denormalized for display so the table doesn't have to resolve recipients. */
  recipientEmail: string;
  corridorId: CorridorId;
  /** Vortex-created (Privy) deposit address the sender pays into. */
  payinWallet: string;
  payinNetwork: string;
  /** Crypto / stablecoin amount expected into the payin wallet. */
  amountIn: string;
  amountInToken: string;
  /** Fiat amount paid out to the recipient bank account. */
  fiatPayoutAmount: string;
  payoutCurrency: string;
  status: TransactionStatus;
  /** Populated only for failed payouts — the reason surfaced in the recovery action. */
  failureReason?: string;
  createdAt: string;
}

/** Bank payout details the sender captures up-front; the recipient only completes KYC/KYB. */
export interface RecipientBankDetails {
  method: RecipientMethod;
  /** Single rail value: PIX key, IBAN, CLABE, or ACH account number. */
  value: string;
}

export interface Recipient {
  id: string;
  accountId: string;
  /** Recipient's email — they receive a KYC/KYB invite and onboard themselves. */
  email: string;
  recipientType: AccountType;
  corridorId: CorridorId;
  /** Payout amount the sender intends to send this recipient. */
  amount: string;
  payoutCurrency: string;
  bankDetails: RecipientBankDetails;
  status: RecipientStatus;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  /** The address the simulated completion email was "sent" to. */
  email: string;
  createdAt: string;
  read: boolean;
}
