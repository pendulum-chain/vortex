export type AveniaIdentityStatus = "NOT-IDENTIFIED" | "CONFIRMED";

export enum AveniaAccountType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY"
}

export function isValidAveniaAccountType(value: string): value is AveniaAccountType {
  return Object.values(AveniaAccountType).includes(value as AveniaAccountType);
}

export interface AveniaSubaccountAccountInfo {
  id: string;
  countrySubdivisionTaxResidence: string;
  accountType: AveniaAccountType;
  name: string;
  countryTaxResidence: string;
  identityStatus: AveniaIdentityStatus;
  fullName: string;
  birthdate: string;
  taxId: string;
}

export interface AveniaSubaccount {
  subAccountId: string;
  mainAccountId: string;
  createdAt: string;
  accountInfo: AveniaSubaccountAccountInfo;
}

export interface PixKeyData {
  name: string;
  taxId: string;
  bankName: string;
}

export interface AveniaQuoteResponse {
  quoteToken: string;
  inputCurrency: string;
  inputPaymentMethod: string;
  inputAmount: string;
  outputAmount: string;
  appliedFees: AveniaOperationFee[];
  basePrice?: string;
}

export function isValidKYCDocType(value: string): value is AveniaDocumentType {
  return Object.values(AveniaDocumentType).includes(value as unknown as AveniaDocumentType);
}

export enum BrlaCurrency {
  BRL = "BRL",
  BRLA = "BRLA",
  USDC = "USDC",
  USDCe = "USDCe",
  USDT = "USDT",
  USDM = "USDM"
}

export enum AveniaPaymentMethod {
  PIX = "PIX",
  INTERNAL = "INTERNAL",
  BASE = "BASE",
  CELO = "CELO",
  ETHEREUM = "ETHEREUM",
  GNOSIS = "GNOSIS",
  MOONBEAM = "MOONBEAM",
  POLYGON = "POLYGON",
  TRON = "TRON"
}

export interface PayInQuoteParams {
  blockchainSendMethod?: BlockchainSendMethod;
  inputCurrency: BrlaCurrency;
  inputPaymentMethod: AveniaPaymentMethod;
  inputAmount: string;
  outputCurrency: BrlaCurrency;
  outputPaymentMethod: AveniaPaymentMethod;
  inputThirdParty: boolean;
  outputThirdParty: boolean;
  subAccountId?: string;
}

export enum BlockchainSendMethod {
  TRANSFER = "TRANSFER",
  PERMIT = "PERMIT"
}

export interface PayOutQuoteParams {
  outputThirdParty: boolean;
  outputAmount: string;
  subAccountId?: string;
  outputCurrency?: BrlaCurrency;
  outputPaymentMethod?: AveniaPaymentMethod;
}

export interface OnchainSwapQuoteParams {
  inputCurrency: BrlaCurrency;
  inputAmount: string;
  outputCurrency: BrlaCurrency;
  outputPaymentMethod?: AveniaPaymentMethod;
}

export enum AveniaTicketStatus {
  ON_HOLD = "ON-HOLD",
  PENDING = "PENDING",
  UNPAID = "UNPAID",
  PROCESSING = "PROCESSING",
  PAID = "PAID",
  FAILED = "FAILED",
  PARTIAL_FAILED = "PARTIAL-FAILED"
}

// /account/tickets endpoint related types
export interface BaseTicket {
  id: string;
  status: AveniaTicketStatus;
  userId: string;
  reason: string;
  failureReason: string;
  // Wire timestamps are ISO strings — JSON cannot contain a Date.
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  quote: {
    id: string;
    ticketId: string;
    inputPaymentMethod: string;
    outputAmount: string;
    appliedFees: AveniaOperationFee[];
  };
}

export interface AveniaOperationFee {
  type: AveniaFeeType;
  amount: string;
  currency: BrlaCurrency;
  rebatable: boolean;
}

export enum AveniaFeeType {
  MARKUP = "Markup Fee",
  GAS = "Gas Fee",
  CONVERSION = "Conversion Fee",
  IN = "In Fee",
  OUT = "Out Fee"
}

export interface PixInputTicketPayload {
  quoteToken: string;
  ticketBrlPixInput?: {
    additionalData: string;
  };
  ticketBlockchainOutput:
    | {
        walletChain: string;
        walletAddress: string;
      }
    | {
        beneficiaryWalletId: string;
      };
}

export interface PixInputTicketOutput {
  id: string;
  brCode: string;
  // Wire timestamp is an ISO string — JSON cannot contain a Date.
  expiration: string;
}

export interface PixOutputTicketOutput {
  id: string;
}

export interface PixOutputTicketPayload {
  quoteToken: string;
  ticketBrlPixOutput: {
    pixKey: string;
  };
  ticketBlockchainInput?: {
    walletAddress: string;
    permit?: {
      r: string;
      s: string;
      v: number;
      nonce: number;
      deadline: number;
    };
  };
}

export interface OnchainSwapTicketPayload {
  quoteToken: string;
  ticketBlockchainOutput: {
    walletChain: string;
    walletAddress: string;
  };
}

export interface AveniaPayoutTicket extends BaseTicket {
  brazilianFiatReceiverInfo: {
    id: string;
    ticketId: string;
    pixKey: string;
    endToEndId: string;
  };
  blockchainSenderInfo: {
    id: string;
    ticketId: string;
    walletAddress: string;
    txHash: string;
  };
  blockchainInputInfo: {
    id: string;
    ticketId: string;
    r: string;
    s: string;
    v: number;
    nonce: number;
    deadline: number;
    personalSignature: string;
    personalSignatureDeadline: number;
  };
  RefundableParameter: string;
}

export interface AveniaPayinTicket extends BaseTicket {
  brazilianFiatSenderInfo: {
    id?: string;
    ticketId?: string;
    referenceLabel?: string;
    additionalData?: string;
    name: string;
    taxId: string;
    bankCode: string;
    branchCode: string;
    accountNumber: string;
    accountType: string;
    endToEndId: string;
  };
  blockchainReceiverInfo: {
    id: string;
    ticketId: string;
    walletAddress: string;
    walletChain: string;
    walletMemo: string;
    txHash: string;
  };
  brlPixInputInfo?: {
    id: string;
    ticketId: string;
    referenceLabel: string;
    additionalData: string;
    brCode: string;
  };
  RefundableParameter: string;
}

export interface AveniaSwapTicket extends BaseTicket {
  blockchainSenderInfo: {
    id: string;
    ticketId: string;
    walletAddress: string;
    txHash: string;
  };
  blockchainReceiverInfo: {
    id: string;
    ticketId: string;
    walletAddress: string;
    walletChain: string;
    walletMemo: string;
    txHash: string;
  };
  blockchainInputInfo: {
    id: string;
    ticketId: string;
    r: string;
    s: string;
    v: number;
    nonce: number;
    deadline: number;
    personalSignature: string;
    personalSignatureDeadline: number;
  };
}

// Limit types
export interface UsedLimitDetails {
  year: number;
  month: number;
  usedFiatIn: string;
  usedFiatOut: string;
  usedChainIn: string;
  usedChainOut: string;
}

export interface Limit {
  currency: string;
  maxFiatIn: string;
  maxFiatOut: string;
  maxChainIn: string;
  maxChainOut: string;
  usedLimit: UsedLimitDetails;
}

export interface LimitInfo {
  blocked: boolean;
  createdAt: string;
  limits: Limit[];
}

export interface AccountLimitsResponse {
  limitInfo: LimitInfo;
}

export interface AveniaSubaccountWallet {
  id: string;
  walletAddress: string;
  chain: string;
}

export interface AveniaAccountInfoResponse {
  id: string;
  accountInfo: AveniaSubaccountAccountInfo;
  wallets: AveniaSubaccountWallet[];
  pixKey: string;
  brCode: string;
  createdAt: string;
}

export interface KycLevel1Payload {
  subAccountId: string;
  fullName: string;
  dateOfBirth: string;
  countryOfTaxId: string;
  taxIdNumber: string;
  email: string;
  country: string;
  state: string;
  city: string;
  zipCode: string;
  streetAddress: string;
  uploadedSelfieId: string;
  uploadedDocumentId: string;
}

export interface KycLevel1Response {
  id: string;
}

export interface AveniaImportKycTokenRequest {
  importToken: string;
}

export interface AveniaImportKycTokenResponse {
  id: string;
  message: string;
}

export type AveniaUboControlRole =
  | "CEO"
  | "CFO"
  | "COO"
  | "CTO"
  | "President"
  | "Vice President"
  | "Director"
  | "Managing Director"
  | "Managing Partner"
  | "General Partner"
  | "Partner"
  | "Secretary"
  | "Treasurer"
  | "Chairman"
  | "Board Member"
  | "Authorized Signatory"
  | "General Counsel"
  | "Owner"
  | "Founder"
  | "Manager"
  | "Member"
  | "Comptroller"
  | "Chief Compliance Officer";

export interface AveniaUboPayload {
  fullName: string;
  dateOfBirth: string;
  countryOfTaxId: string;
  taxIdNumber: string;
  email?: string;
  phone?: string;
  percentageOfOwnership: string;
  hasControl?: AveniaUboControlRole;
  uploadedIdentificationId: string;
  uploadedSelfieId?: string;
  documentCountry: string;
  streetLine1: string;
  streetLine2?: string;
  streetLine3?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface AveniaUboResponse {
  id: string;
}

export type AveniaKybReasonForAccountOpening =
  | "charitable_donations"
  | "ecommerce_retail_payments"
  | "investment_purposes"
  | "other"
  | "payments_to_friends_or_family_abroad"
  | "payroll"
  | "personal_or_living_expenses"
  | "protect_wealth"
  | "purchase_goods_and_services"
  | "receive_payments_for_goods_and_services"
  | "tax_optimization"
  | "third_party_money_transmission"
  | "treasury_management";

export type AveniaKybSourceOfFunds =
  | "business_loans"
  | "grants"
  | "inter_company_funds"
  | "investment_proceeds"
  | "legal_settlement"
  | "owners_capital"
  | "pension_retirement"
  | "sale_of_assets"
  | "sales_of_goods_and_services"
  | "third_party_funds"
  | "treasury_reserves";

export type AveniaKybNumberOfEmployees = "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1001+";

export type AveniaKybAnnualRevenue =
  | "less_than_100k"
  | "100k_to_1m"
  | "1m_to_10m"
  | "10m_to_50m"
  | "50m_to_100m"
  | "more_than_100m";

export interface AveniaKybLevel1Payload {
  uboIds: string[];
  companyLegalName: string;
  companyRegistrationNumber: string;
  taxIdentificationNumberTin: string;
  businessActivityDescription: string;
  reasonForAccountOpening: AveniaKybReasonForAccountOpening;
  sourceOfFundsAndIncome: AveniaKybSourceOfFunds;
  numberOfEmployees: AveniaKybNumberOfEmployees;
  estimatedAnnualRevenueUsd: AveniaKybAnnualRevenue;
  estimatedMonthlyVolumeUsd: string;
  countryTaxResidence: string;
  countrySubdivisionTaxResidence?: string;
  companyStreetLine1: string;
  companyStreetLine2?: string;
  companyStreetLine3?: string;
  companyCity: string;
  companyState: string;
  companyZipCode: string;
  companyCountry: string;
  certificateOfIncorporationDocumentId: string;
  taxIdentificationDocumentId: string;
  website?: string;
  socialMedia?: string;
  emailPixKey?: string;
  sandboxReject?: boolean;
}

export interface KybLevel1Response {
  attemptId: string;
  authorizedRepresentativeUrl: string;
  basicCompanyDataUrl: string;
}

/**
 * Avenia models individual and company verification as the same "attempt" resource
 * (both are fetched from /v2/kyc/attempts), so the polled response and the webhook
 * payload carry this identical shape. result and resultMessage are absent until an
 * attempt settles.
 */
export interface AveniaVerificationAttempt {
  id: string;
  levelName: string;
  submissionData?: Record<string, unknown>;
  status: KycAttemptStatus;
  result?: KycAttemptResult;
  resultMessage?: string;
  retryable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KybAttemptStatusResponse {
  failureReason?: string;
  result?: KycAttemptResult;
  retryable?: boolean;
  status: KycAttemptStatus;
}

export interface AveniaVerificationAttemptResponse {
  attempt: AveniaVerificationAttempt;
}

export type AveniaKybAttemptStatusResponse = AveniaVerificationAttemptResponse;

export enum AveniaDocumentType {
  ID = "ID",
  DRIVERS_LICENSE = "DRIVERS-LICENSE",
  PASSPORT = "PASSPORT",
  RESIDENCE_PERMIT = "RESIDENCE-PERMIT",
  SELFIE = "SELFIE",
  SELFIE_FROM_LIVENESS = "SELFIE-FROM-LIVENESS",
  CERTIFICATE_OF_INCORPORATION = "CERTIFICATE-OF-INCORPORATION",
  COMPANY_TAX_IDENTIFICATION_DOCUMENT = "COMPANY-TAX-IDENTIFICATION-DOCUMENT"
}

export interface DocumentUploadRequest {
  documentType: AveniaDocumentType;
  isDoubleSided?: boolean;
}

export interface DocumentUploadResponse {
  id: string;
  uploadURLFront: string;
  uploadURLBack?: string;
  livenessUrl?: string;
  validateLivenessToken?: string;
}

export interface AveniaDocument {
  id: string;
  documentType: AveniaDocumentType;
  uploadURLFront?: string;
  uploadStatusFront: string;
  uploadErrorFront?: string;
  uploadURLBack?: string;
  uploadStatusBack?: string;
  uploadErrorBack?: string;
  ready: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AveniaDocumentResponse {
  document: AveniaDocument;
}

export enum KycAttemptStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  EXPIRED = "EXPIRED"
}

export enum KycAttemptResult {
  APPROVED = "APPROVED",
  REJECTED = "REJECTED"
}

export interface KycAttempt {
  id: string;
  levelName: string;
  submissionData?: unknown;
  status: KycAttemptStatus;
  result?: KycAttemptResult;
  resultMessage?: string;
  retryable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GetKycAttemptResponse {
  attempts: KycAttempt[];
  cursor?: string;
}

export interface CreateAveniaSubaccountRequest {
  accountType: AveniaAccountType;
  name: string;
  taxId: string;
}

export interface AveniaDocumentGetResponse {
  documents: AveniaDocument[];
  cursor?: string;
}

export interface AveniaAccountBalanceResponse {
  // Wire balances are decimal strings (e.g. "99.8"), not numbers — consumers parse
  // via Big()/Number(). Surfaced by the nightly contract suite.
  balances: {
    BRLA: string;
    USDC: string;
    USDM: string;
    USDT: string;
  };
}

/**
 * Avenia documents no KYB-specific subscription. Company attempts are expected to
 * arrive under KYC because both verification kinds share the attempts resource, but
 * that is unconfirmed — subscribing with All is what makes the assumption safe.
 */
export enum AveniaWebhookSubscription {
  All = "*",
  Kyc = "KYC",
  LimitUpdate = "LIMIT-UPDATE",
  Ticket = "TICKET"
}

export interface AveniaWebhookEvent {
  subAccountId: string;
  subscription: string;
  data: Record<string, unknown>;
  cursor?: string;
}

export interface AveniaWebhook {
  id: string;
  url: string;
  subscriptions: string[];
}

export interface AveniaWebhookRegistration {
  webhookId: string;
}

export interface AveniaWebhooksListResponse {
  webhooks: AveniaWebhook[];
}

export interface AveniaPublicKeyResponse {
  publicKey: string;
}
