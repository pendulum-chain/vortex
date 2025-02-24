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
  address: any;
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
};

export interface RegisterSubaccountPayload {
  phone: string;
  taxIdType: TaxIdType;
  address: BrlaAddress;
  fullName: string;
  cpf: string;
  birthDate: string;
  companyName?: string;
  startDate?: string;
  cnpj?: string;
}

export interface OfframpPayload {
  subaccountId: string;
  pixKey: string;
  amount: string;
  receiverTaxId: string;
}
