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
