export type AveniaIdentityStatus = "NOT-IDENTIFIED" | "CONFIRMED";

export enum AveniaAccountType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY"
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
  inputCurrency: BrlaCurrency;
  inputPaymentMethod: AveniaPaymentMethod;
  inputAmount: string;
  outputCurrency: BrlaCurrency;
  outputPaymentMethod: AveniaPaymentMethod;
  inputThirdParty: boolean;
  outputThirdParty: boolean;
  subAccountId: string;
}

export enum BlockchainSendMethod {
  TRANSFER = "TRANSFER",
  PERMIT = "PERMIT"
}

export interface PayOutQuoteParams {
  outputThirdParty: boolean;
  outputAmount: string;
  subAccountId: string;
}

export enum AveniaTicketStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED"
}

// /account/tickets endpoint related types
export interface BaseTicket {
  id: string;
  status: AveniaTicketStatus;
  userId: string;
  reason: string;
  failureReason: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  quote: {
    id: string;
    ticketId: string;
    inputPaymentMethod: string;
  };
}

export interface PixInputTicketPayload {
  quoteToken: string;
  ticketBrlPixInput: {
    additionalData: string;
  };
  ticketBlockchainOutput: {
    walletChain: string;
    walletAddress: string;
  };
}

export interface PixInputTicketOutput {
  id: string;
  brCode: string;
  expiration: Date;
}

export interface PixOutputTicketOutput {
  id: string;
}

// TODO verify ticket endpoint outputs for this modality
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
  brlPixOutputInfo: {
    id: string;
    ticketId: string;
    pixMessage: string;
    senderAccountBankName: string;
    senderAccountNumber: string;
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

export interface KybLevel1Response {
  attemptId: string;
  authorizedRepresentativeUrl: string;
  basicCompanyDataUrl: string;
}

export interface KybAttemptStatusResponse {
  attempt: {
    id: string;
    levelName: string;
    submissionData: Record<string, unknown>;
    status: KycAttemptStatus;
    result: KycAttemptResult;
    resultMessage: string;
    retryable: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

export enum AveniaDocumentType {
  ID = "ID",
  DRIVERS_LICENSE = "DRIVERS-LICENSE",
  PASSPORT = "PASSPORT",
  SELFIE = "SELFIE",
  SELFIE_FROM_LIVENESS = "SELFIE-FROM-LIVENESS"
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
  levelName: "level-1";
  submissionData: unknown;
  status: KycAttemptStatus;
  result: KycAttemptResult;
  resultMessage: string;
  retryable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GetKycAttemptResponse {
  attempts: KycAttempt[];
}

export interface CreateAveniaSubaccountRequest {
  accountType: AveniaAccountType;
  name: string;
  taxId: string;
}

export interface AveniaDocumentGetResponse {
  documents: [
    {
      id: string;
      documentType: string;
      uploadURLFront: string;
      uploadStatusFront: string;
      uploadErrorFront: string;
      uploadURLBack: string;
      uploadStatusBack: string;
      uploadErrorBack: string;
      ready: true;
      createdAt: Date;
      updatedAt: Date;
    }
  ];
}

export interface AveniaAccountBalanceResponse {
  balances: {
    BRLA: number;
    USDC: number;
    USDM: number;
    USDT: number;
  };
}
