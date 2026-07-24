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
  /** Provider-registered company name, when the provider account already exists. */
  companyName?: string | null;
  kind: OnboardingKind;
  reauthenticationRequired?: boolean;
  status: OnboardingStatus;
  /** Business tax id (CNPJ) already supplied to the provider — enables form-less resume. */
  taxReference?: string | null;
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

/** Transfer lifecycle: fund the payin side, then settle to the destination. */
export type TransactionStatus = "awaiting_payin" | "processing" | "completed" | "failed" | "cancelled";

export interface Transaction {
  id: string;
  direction: "BUY" | "SELL";
  accountId: string;
  recipientId: string;
  /** Denormalized display label; for ramp-history rows a destination label ("Payout account", "Your wallet"). */
  recipientEmail: string;
  corridorId: CorridorId;
  /** SELL: the sender's funding wallet. BUY: the wallet tokens are delivered to. */
  payinWallet: string;
  payinNetwork: string;
  /** Amount the user pays in: stablecoin for SELL, fiat for BUY. */
  amountIn: string;
  amountInToken: string;
  /** Amount received at the destination: fiat to the payout account for SELL, crypto to the wallet for BUY. */
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
  /** Whether this row is a pending invitation, an accepted relationship, or the sender themself. */
  kind: "invitation" | "relationship" | "self";
  /** Recipient's email — empty for invite-link recipients until they onboard themselves. */
  email: string;
  /** Sender-facing label: nickname or invite alias, or the recipient's onboarded name. */
  name?: string;
  recipientType: AccountType;
  corridorId: CorridorId;
  payoutCurrency: string;
  /** Bank details the recipient provides during onboarding — value is empty until approved. */
  bankDetails: RecipientBankDetails;
  status: RecipientStatus;
  /** Raw invite token for re-copying the link — empty once accepted or for legacy invites. */
  inviteCode: string;
  /** Discount-carrying invitations deep-link to the dashboard; re-copy rebuilds that URL. */
  hasSeededDiscounts?: boolean;
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
