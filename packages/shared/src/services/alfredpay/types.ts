import { FiatToken } from "../../tokens/types/base";

export enum AlfredpayCustomerType {
  INDIVIDUAL = "INDIVIDUAL",
  BUSINESS = "BUSINESS"
}

export type AlfredPayType = AlfredpayCustomerType;
export const AlfredPayType = AlfredpayCustomerType;

export enum AlfredPayStatus {
  Consulted = "CONSULTED",
  LinkOpened = "LINK_OPENED",
  UserCompleted = "USER_COMPLETED",
  Verifying = "VERIFYING",
  Failed = "FAILED",
  Success = "SUCCESS",
  UpdateRequired = "UPDATE_REQUIRED"
}

export enum AlfredPayCountry {
  MX = "MX", // Mexico
  AR = "AR", // Argentina
  BR = "BR", // Brazil
  CO = "CO", // Colombia
  DO = "DO", // Dominican Republic
  US = "US", // United States
  CN = "CN", // China
  HK = "HK", // Hong Kong
  CL = "CL", // Chile
  PE = "PE", // Peru
  BO = "BO" // Bolivia
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

export type GetKybRedirectLinkResponse = GetKycRedirectLinkResponse;

export enum AlfredpayKycStatus {
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  IN_REVIEW = "IN_REVIEW",
  UPDATE_REQUIRED = "UPDATE_REQUIRED",
  CREATED = "CREATED"
}

export type AlfredpayKybStatus = AlfredpayKycStatus;
export const AlfredpayKybStatus = AlfredpayKycStatus;

export interface GetKycStatusResponse {
  status: AlfredpayKycStatus;
  updatedAt: string;
  metadata?: {
    failureReason?: string;
    requiredFields?: string[];
  } | null;
}

export interface GetKybStatusResponse {
  status: AlfredpayKybStatus;
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

export type GetKybSubmissionResponse = GetKycSubmissionResponse;

export interface RetryKycSubmissionResponse {
  message: string;
}

export type RetryKybSubmissionResponse = RetryKycSubmissionResponse;

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

export enum AlfredpayOfframpStatus {
  ON_CHAIN_DEPOSIT_RECEIVED = "ON_CHAIN_DEPOSIT_RECEIVED",
  TRADE_COMPLETED = "TRADE_COMPLETED",
  FIAT_TRANSFER_INITIATED = "FIAT_TRANSFER_INITIATED",
  FIAT_TRANSFER_COMPLETED = "FIAT_TRANSFER_COMPLETED",
  FAILED = "FAILED"
}

export enum AlfredpayOnrampStatus {
  CREATED = "CREATED",
  FIAT_DEPOSIT_RECEIVED = "FIAT_DEPOSIT_RECEIVED",
  TRADE_COMPLETED = "TRADE_COMPLETED",
  ON_CHAIN_INITIATED = "ON_CHAIN_INITIATED",
  ON_CHAIN_COMPLETED = "ON_CHAIN_COMPLETED",
  FAILED = "FAILED"
}

export interface AlfredpayOnrampStatusMetadata {
  txHash?: string;
  failureReason?: string;
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
  chain: string;
  depositAddress: string;
}

export interface AlfredpayOnrampTransaction extends AlfredpayBaseTransaction {
  status: AlfredpayOnrampStatus;
  email: string;
  paymentMethodType: AlfredpayPaymentMethodType;
  txHash: string | null;
  externalId: string;
  memo: string;
  metadata?: AlfredpayOnrampStatusMetadata | null;
  quote: AlfredpayOnrampQuote;
}

export interface AlfredpayOfframpTransaction extends AlfredpayBaseTransaction {
  status: AlfredpayOfframpStatus;
  fiatAccountId: string;
  memo?: string;
  expiration: string;
  quote: AlfredpayOfframpQuote;
}

export interface AlfredpayFiatPaymentInstructions {
  paymentType: string;
  clabe?: string;
  reference?: string;
  expirationDate?: string;
  bankName?: string;
  accountHolderName?: string;
  //wildcard
  [key: string]: unknown;
}

export interface GetAlfredpayOnrampTransactionResponse extends AlfredpayOnrampTransaction {
  fiatPaymentInstructions: AlfredpayFiatPaymentInstructions;
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

export interface AlfredpayFiatAccount {
  fiatAccountId: string;
  customerId: string;
  type: AlfredpayFiatAccountType;
  fiatAccountFields: AlfredpayFiatAccountFields;
  createdAt?: string;
}

export type ListAlfredpayFiatAccountsResponse = AlfredpayFiatAccount[];

const ALFREDPAY_FIAT_TOKEN_SET = new Set<FiatToken>([FiatToken.USD, FiatToken.MXN, FiatToken.COP]);

export const isAlfredpayToken = (token: FiatToken): boolean => ALFREDPAY_FIAT_TOKEN_SET.has(token);

// MXN KYC form submission types
export enum AlfredpayDocumentType {
  INE = "INE",
  RESIDENT_CARD = "Resident card",
  PASSPORT = "passport"
}

export enum AlfredpayColombiaDocumentType {
  CC = "CC",
  CE = "CE"
}

export interface SubmitKycInformationRequest {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  email?: string;
  country: string;
  city: string;
  state: string;
  zipCode: string;
  address: string;
  dni: string;
  typeDocument?: string; // MXN
  typeDocumentCol?: AlfredpayColombiaDocumentType;
  phoneNumber?: string; // Colombia
}

export interface SubmitKycInformationResponse {
  submissionId: string;
}

export enum AlfredpayKycFileType {
  FRONT = "National ID Front",
  BACK = "National ID Back"
}
