export interface TriggerOfframpRequest {
  taxId: string;
  pixKey: string;
  amount: string;
  receiverTaxId: string;
}

export interface UsedLimitsData {
  limitMint: number;
  limitBurn: number;
  limitSwapBuy: number;
  limitSwapSell: number;
  limitBRLAOutOwnAccount: number;
  limitBRLAOutThirdParty: number;
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
