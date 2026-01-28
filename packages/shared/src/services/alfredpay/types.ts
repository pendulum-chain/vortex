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
  BANK = "BANK",
  ATM = "ATM",
  RETAIL = "RETAIL",
  SPEI = "SPEI",
  PIX = "PIX",
  BANK_CN = "BANK_CN"
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
