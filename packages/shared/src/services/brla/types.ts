import { BrlaKYCDocType } from "../..";

export interface SubaccountData {
  id: string;
  fullName: string;
  phone: string;
  kyc: KYCData;
  address: BrlaAddress;
  createdAt: string;
  wallets: { evm: string; tron: string };
  brCode: string;
}

export type AveniaIdentityStatus = "NOT-IDENTIFIED" | "CONFIRMED";

export enum AveniaAccountType {
  INDIVIDUAL = "INDIVIDUAL"
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

export interface KYCData {
  level: number;
  documentData: string;
  documentType: string;
  limits: {
    limitMint: number;
    limitBurn: number;
    limitSwapBuy: number;
    limitSwapSell: number;
    limitBRLAOutOwnAccount: number;
    limitBRLAOutThirdParty: number;
  };
}

type TaxIdType = "CPF" | "CNPJ";

type BrlaAddress = {
  cep: string;
  city: string;
  state: string;
  street: string;
  number: string;
  district: string;
  complement?: string;
};

export interface RegisterSubaccountPayload {
  phone: string;
  taxIdType: TaxIdType;
  address: BrlaAddress;
  fullName: string;
  cpf: string;
  birthdate: string;
  companyName?: string;
  startDate?: string;
  cnpj?: string;
}

export interface OfframpPayload {
  pixKey: string;
  amount: number;
  taxId: string;
}

export interface OnrampPayload {
  amount: string;
  referenceLabel: string;
  subaccountId: string;
}

export interface PixKeyData {
  name: string;
  taxId: string;
  bankName: string;
}

// Interface response from /pay-in/pix/history
export interface DepositLog {
  chain: string;
  walletAddress: string;
  amount: number;
  taxId: string;
  due: string;
  id: string;
  createdAt: string;
  status: string;
  payerName: string;
  updatedAt: string;
  mintOps: MintOp[];
  referenceLabel: string;
  externalId: string;
  payerBankCode: string;
  payerBranchCode: string;
  payerAccountNumber: string;
  payerAccountType: string;
}

// Interface response from /swap/history
export interface SwapLog {
  chain: string;
  walletAddress: string;
  receiverAddress: string;
  brlaAmount: number;
  usdAmount: number;
  basePrice: string;
  baseFee: string;
  coin: string;
  id: string;
  createdAt: string;
  status: string;
  smartContractOps: SmartContractOp[];
  externalId: string;
}

interface Feedback {
  id: string;
  success: boolean;
  errorMsg: string;
  createdAt: string;
}

interface SmartContractOp {
  id: string;
  operationName: string;
  posted: boolean;
  tx: string;
  notPostedReason: string;
  createdAt: string;
  isRetry: boolean;
  feedback: Feedback;
}

interface MintOp {
  id: string;
  amount: number;
  createdReason: string;
  createdAt: string;
  fee: number;
  smartContractOps: SmartContractOp[];
}

// /fast-quote endpoint related types

export type FastQuoteOperationType = "swap";

export type FastQuoteCoin = "BRLA" | "USDC";

export enum BrlaSupportedChain {
  BRLA = "Moonbeam",
  Polygon = "Polygon"
  // etc
}

export interface AveniaQuoteResponse {
  quoteToken: string;
  inputCurrency: string;
  inputPaymentMethod: string;
  inputAmount: string;
}

export interface FastQuoteQueryParams {
  subaccountId: string | undefined;
  operation: FastQuoteOperationType;
  amount: number;
  inputCoin: FastQuoteCoin;
  outputCoin: FastQuoteCoin;
  chain: BrlaSupportedChain;
  markup?: string;
  fixOutput: boolean;
}

export interface FastQuoteResponse {
  basePrice: string;
  token: string;
  sub: string;
  operation: string;
  amountBrl: string;
  amountUsd: string;
  amountToken: string;
  baseFee: string;
  gasFee: string;
  markupFee: string;
  inputCoin: string;
  outputCoin: string;
  chain: string;
  subaccountId: string;
}

// on-chain/history/out endpoint related types

export interface OnchainLog {
  id: string;
  userId: string;
  fromChain: string;
  toChain: string;
  from: string;
  to: string;
  value: string;
  outputValue: string;
  outputCoin: string;
  inputCoin: string;
  createdAt: string;
  externalId: string;
  fromBusinessAccount: boolean;
  exactOutput: boolean;
  coverDifference: boolean;
  usdcPermit: null | string;
  usdtPermit: null | string;
  brlaPermit: null | string;
  smartContractOps: SmartContractOperation[];
  notifyEmail: boolean;
  forced: boolean;
  reason: string;
  receiverName: string;
  receiverTaxId: string;
}

// /swap Endpoint related types
export interface SwapPayload {
  token: string;
  receiverAddress: string;
  externalId?: string;
}

// Other nested types
export enum SmartContractOperationType {
  MINT = "MINT",
  BURN = "BURN"
}

export function isValidKYCDocType(value: string): value is AveniaDocumentType {
  return Object.values(AveniaDocumentType).includes(value as unknown as AveniaDocumentType);
}

export interface KycLevel2Response {
  id: string;
  selfieUploadUrl: string;
  RGFrontUploadUrl: string;
  RGBackUploadUrl: string;
  CNHUploadUrl: string;
}

export interface KycRetryPayload {
  fullName: string;
  cpf: string;
  birthdate: string;
  cnpj?: string;
  companyName?: string;
  startDate?: string;
}

interface SmartContractOperation {
  id: string;
  operationName: SmartContractOperationType;
  operationId: string;
  operationType: string;
  executed: boolean;
  tx: string;
  reason: string;
  createdAt: string;
  isRetry: boolean;
  feedback: OperationFeedback;
}

interface OperationFeedback {
  id: string;
  feedbackType: string;
  operationId: string;
  smartcontractOperationId: string;
  success: boolean;
  errorMsg: string;
  createdAt: string;
}

export interface OnChainOutPayload {
  chain: string;
  to: string;
  value: number;
  exactOutput: boolean;
  inputCoin: string;
  outputCoin: string;
}

export enum BrlaCurrency {
  BRL = "BRL",
  BRLA = "BRLA",
  USDC = "USDC",
  USDCe = "USDCe",
  USDT = "USDT",
  USDM = "USDM"
}

export enum BrlaPaymentMethod {
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
  inputPaymentMethod: BrlaPaymentMethod;
  inputAmount: string;
  outputCurrency: BrlaCurrency;
  outputPaymentMethod: BrlaPaymentMethod;
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
}

// /account/tickets endpoint related types
export interface BaseTicket {
  id: string;
  status: string;
  reason: string;
  failureReason: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
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
  ticket: BaseTicket;
  brlPixInputInfo: {
    id: string;
    ticketId: string;
    referenceLabel: string;
    additionalData: string;
    brCode: string;
  };
  blockchainReceiverInfo: {
    id: string;
    ticketId: string;
    walletAddress: string;
    walletChain: string;
    walletMemo: string;
    txHash: string;
  };
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

export interface PixOutputTicketOutput {
  ticket: BaseTicket;
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

export enum AveniaDocumentType {
  ID = "ID",
  DRIVERS_LICENSE = "DRIVERS-LICENSE",
  PASSPORT = "PASSPORT",
  SELFIE = "SELFIE"
}

export interface DocumentUploadRequest {
  documentType: AveniaDocumentType;
  isDoubleSided?: boolean;
}

export interface DocumentUploadResponse {
  id: string;
  uploadURLFront: string;
  uploadURLBack?: string;
}

export interface CreateAveniaSubaccountRequest {
  accountType: AveniaAccountType;
  name: string;
  taxId: string;
}
