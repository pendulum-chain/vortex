export enum AlfredpayCustomerType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY" // Assuming COMPANY might exist based on INDIVIDUAL presence
}

export interface CreateAlfredpayCustomerRequest {
  type: AlfredpayCustomerType;
  country: string;
}

export interface CreateAlfredpayCustomerResponse {
  customerId: string;
  createdAt: string;
}

export interface FindAlfredpayCustomerResponse {
  customerId: string;
  country: string;
  createdAt: string;
  type: string;
}

export interface GetKycRedirectLinkResponse {
  verification_url: string;
  submissionId: string;
}

export enum AlfredpayKycStatus {
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  IN_REVIEW = "IN_REVIEW",
  UPDATE_REQUIRED = "UPDATE_REQUIRED",
  CREATED = "CREATED"
}

export interface GetKycStatusResponse {
  status: AlfredpayKycStatus;
  updatedAt: string;
  metadata?: {
    failureReason?: string;
    requiredFields?: string[];
  } | null;
}

export interface GetKycSubmissionResponse {
  submissionId: string;
  createdAt: string;
}

export enum AlfredpayOnChainCurrency {
  USDC = "USDC",
  USDT = "USDT"
}

export enum AlfredpayFiatCurrency {
  HK_USD = "HK_USD",
  GTQ = "GTQ",
  HKD = "HKD",
  MXN = "MXN",
  ARS = "ARS",
  BRL = "BRL",
  COP = "COP",
  USD = "USD",
  DOP = "DOP",
  CNY = "CNY",
  CLP = "CLP",
  BOB = "BOB"
}

export type AlfredpayCurrency = AlfredpayOnChainCurrency | AlfredpayFiatCurrency;

export enum AlfredpayChain {
  ETH = "ETH",
  MATIC = "MATIC",
  XLM = "XLM",
  OP = "OP",
  ARB = "ARB",
  BASE = "BASE",
  TRX = "TRX",
  SOL = "SOL",
  CELO = "CELO",
  AVAX = "AVAX",
  BNB = "BNB"
}

export enum AlfredpayPaymentMethodType {
  BANK = "BANK"
}

export interface AlfredpayQuoteMetadata {
  businessId: string;
  customerId: string;
  [key: string]: unknown;
}

interface AlfredpayBaseQuoteRequest<FromCurrency, ToCurrency> {
  fromCurrency: FromCurrency;
  toCurrency: ToCurrency;
  fromAmount?: string;
  toAmount?: string;
  chain?: AlfredpayChain;
  paymentMethodType: AlfredpayPaymentMethodType;
  metadata: AlfredpayQuoteMetadata;
}

export type CreateAlfredpayOnrampQuoteRequest = AlfredpayBaseQuoteRequest<AlfredpayFiatCurrency, AlfredpayOnChainCurrency>;

export type CreateAlfredpayOfframpQuoteRequest = AlfredpayBaseQuoteRequest<AlfredpayOnChainCurrency, AlfredpayFiatCurrency>;

export enum AlfredpayFeeType {
  COMMISSION_FEE = "commissionFee",
  PROCESSING_FEE = "processingFee",
  TAX_FEE = "taxFee",
  NETWORK_FEE = "networkFee"
}

export interface AlfredpayFee {
  type: AlfredpayFeeType;
  amount: string;
  currency: string;
}

interface AlfredpayBaseQuoteResponse<FromCurrency, ToCurrency> {
  quoteId: string;
  fromCurrency: FromCurrency;
  toCurrency: ToCurrency;
  fromAmount: string;
  toAmount: string;
  chain?: AlfredpayChain;
  paymentMethodType: AlfredpayPaymentMethodType;
  expiration: string;
  fees: AlfredpayFee[];
  rate: string;
  metadata: Record<string, unknown>;
}

export type AlfredpayOnrampQuote = AlfredpayBaseQuoteResponse<AlfredpayFiatCurrency, AlfredpayOnChainCurrency>;
export type AlfredpayOfframpQuote = AlfredpayBaseQuoteResponse<AlfredpayOnChainCurrency, AlfredpayFiatCurrency>;

export interface CreateAlfredpayOnrampRequest {
  customerId: string;
  quoteId: string;
  fromCurrency: AlfredpayFiatCurrency;
  toCurrency: AlfredpayOnChainCurrency;
  amount: string;
  chain: AlfredpayChain;
  paymentMethodType: AlfredpayPaymentMethodType;
  depositAddress: string;
}

export interface CreateAlfredpayOfframpRequest {
  customerId: string;
  quoteId: string;
  fromCurrency: AlfredpayOnChainCurrency;
  toCurrency: AlfredpayFiatCurrency;
  amount: string;
  chain: AlfredpayChain;
  fiatAccountId: string;
  memo?: string;
  originAddress: string;
}

export enum AlfredpayTransactionStatus {
  CREATED = "CREATED",
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED"
}

interface AlfredpayBaseTransaction {
  transactionId: string;
  customerId: string;
  createdAt: string;
  updatedAt: string;
  quoteId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  toAmount: string;
  status: AlfredpayTransactionStatus;
  chain: string;
  depositAddress: string;
}

export interface AlfredpayOnrampTransaction extends AlfredpayBaseTransaction {
  paymentMethodType: AlfredpayPaymentMethodType;
  txHash: string | null;
  quote: AlfredpayOnrampQuote;
}

export interface AlfredpayOfframpTransaction extends AlfredpayBaseTransaction {
  fiatAccountId: string;
  memo?: string;
  originAddress: string;
  expiration: string;
  externalId?: string;
  metadata?: Record<string, unknown> | null;
  quote: AlfredpayOfframpQuote;
}

export interface AlfredpayFiatPaymentInstructions {
  paymentType: string;
  clabe?: string;
  reference?: string;
  expirationDate?: string;
  bankName?: string;
  accountHolderName?: string;
}

export interface CreateAlfredpayOnrampResponse {
  transaction: AlfredpayOnrampTransaction;
  fiatPaymentInstructions: AlfredpayFiatPaymentInstructions;
}

export type CreateAlfredpayOfframpResponse = AlfredpayOfframpTransaction;

export enum AlfredpayFiatAccountType {
  SPEI = "SPEI",
  PIX = "PIX",
  COELSA = "COELSA",
  ACH = "ACH",
  ACH_DOM = "ACH_DOM",
  BANK_CN = "BANK_CN",
  BANK_USA = "BANK_USA",
  ACH_CHL = "ACH_CHL",
  ACH_BOL = "ACH_BOL",
  B89 = "B89"
}

export interface AlfredpayFiatAccountFields {
  accountNumber: string;
  accountType: string;
  accountName: string;
  accountBankCode: string;
  accountAlias: string;
  networkIdentifier: string;
  bankStreet?: string;
  bankCity?: string;
  bankState?: string;
  bankCountry?: string;
  bankPostalCode?: string;
  routingNumber?: string;
  isExternal?: boolean;
}

export interface CreateAlfredpayFiatAccountRequest {
  customerId: string;
  type: AlfredpayFiatAccountType;
  fiatAccountFields: AlfredpayFiatAccountFields;
}

export interface CreateAlfredpayFiatAccountResponse {
  fiatAccountId: string;
}
