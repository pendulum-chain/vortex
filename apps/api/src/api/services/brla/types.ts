import { BrlaKYCDocType } from '@packages/shared';

export interface TriggerOfframpRequest {
  taxId: string;
  pixKey: string;
  amount: string;
  receiverTaxId: string;
}

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

type TaxIdType = 'CPF' | 'CNPJ';

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

export interface UsedLimitData {
  limitMint: number;
  limitBurn: number;
  limitSwapBuy: number;
  limitSwapSell: number;
  limitBRLAOutOwnAccount: number;
  limitBRLAOutThirdParty: number;
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

export type FastQuoteOperationType = 'swap';

export type FastQuoteCoin = 'BRLA';

export const enum BrlaSupportedChain {
  BRLA = 'Moonbeam',
  // etc
}

export interface FastQuoteQueryParams {
  subaccountId: string;
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
export const enum SmartContractOperationType {
  MINT = 'MINT',
  BURN = 'BURN',
}

export function isValidKYCDocType(value: string): value is BrlaKYCDocType {
  return Object.values(BrlaKYCDocType).includes(value as unknown as BrlaKYCDocType);
}

export interface KycLevel2Payload {
  documentType: BrlaKYCDocType;
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
