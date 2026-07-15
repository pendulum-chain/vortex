/**
 * Mocked onboarding domain for the Vortex dashboard.
 *
 * Status values are a unified projection of the real Vortex provider enums so
 * this layer is swappable for the live integrations later:
 *   - Avenia (Brazil/BRL): KycAttemptStatus (PENDING|PROCESSING|COMPLETED|EXPIRED)
 *     + KycAttemptResult (APPROVED|REJECTED)
 *   - Monerium (Europe/EURC): normalized profile status (PENDING|APPROVED|REJECTED)
 */

export type OnboardingStatus = "not_started" | "pending" | "started" | "in_review" | "approved" | "rejected";

export type CorridorId = "BR" | "EU" | "MX" | "CO" | "US" | "AR";

export type OnboardingKind = "kyb" | "kyc";

/** How a corridor's onboarding is collected: in-dashboard wizard, external form, or partner redirect. */
export type OnboardingRoute = "headless" | "google_form" | "redirect";

export type AccountType = "company" | "individual";

export type RecipientStatus = "invite_sent" | "pending" | "approved" | "rejected" | "expired";

export type RecipientMethod = "pix" | "iban" | "spei" | "ach";

export type KycProvider = "alfredpay" | "avenia" | "monerium" | "mykobo";

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
  reauthenticationRequired?: boolean;
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
export type TransactionStatus = "awaiting_payin" | "processing" | "completed" | "failed" | "cancelled";

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
  /** Recipient's email — empty for invite-link recipients until they onboard themselves. */
  email: string;
  /** Recipient's name once they complete onboarding via the invite link (mocked). */
  name?: string;
  recipientType: AccountType;
  corridorId: CorridorId;
  /** Payout amount the sender intends to send this recipient. */
  amount: string;
  payoutCurrency: string;
  /** Bank details the recipient provides during onboarding — value is empty until approved. */
  bankDetails: RecipientBankDetails;
  status: RecipientStatus;
  /** Shareable invite token the sender copies and sends out themselves. */
  inviteCode: string;
  /** How many times the invite link was copied — tracked per product request. */
  copyCount: number;
  /** The account holder's own "send to myself" recipient, derived from fetched payout accounts. */
  isSelf?: boolean;
  /** AlfredPay payout target — the saved fiat-account id a self offramp registers against. */
  fiatAccountId?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  /** The address the notification relates to. */
  email: string;
  createdAt: string;
  read: boolean;
}
