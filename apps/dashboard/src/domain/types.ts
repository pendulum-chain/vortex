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

export type RecipientStatus = "pending" | "registered";

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
  /** Avenia supports company KYB; Mykobo/Alfredpay are individual KYC only. */
  supportsKyb: boolean;
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

/** On-ramp converts fiat into stablecoin; off-ramp pays a recipient in fiat. */
export type TransactionDirection = "onramp" | "offramp";

export type TransactionStatus = "completed" | "processing" | "failed";

export interface Transaction {
  id: string;
  accountId: string;
  corridorId: CorridorId;
  direction: TransactionDirection;
  fromCurrency: string;
  fromAmount: string;
  toCurrency: string;
  toAmount: string;
  /** On-ramp: the funding source; off-ramp: the paid recipient. */
  counterparty: string;
  status: TransactionStatus;
  createdAt: string;
}

export interface Recipient {
  id: string;
  accountId: string;
  corridorId: CorridorId;
  name: string;
  method: RecipientMethod;
  /** PIX key, IBAN, etc. */
  destination: string;
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
