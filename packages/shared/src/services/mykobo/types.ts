export enum MykoboTransactionType {
  DEPOSIT = "DEPOSIT",
  WITHDRAW = "WITHDRAW"
}

export enum MykoboCurrency {
  EURC = "EURC",
  USDC = "USDC"
}

export enum MykoboNetwork {
  STELLAR = "STELLAR",
  SOLANA = "SOLANA",
  ETHEREUM = "ETHEREUM",
  BASE = "BASE"
}

export enum MykoboFeeKind {
  DEPOSIT = "deposit",
  WITHDRAW = "withdraw"
}

export enum MykoboTransactionStatus {
  PENDING_PAYER = "PENDING_PAYER",
  PENDING_PAYEE = "PENDING_PAYEE",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED"
}

export interface MykoboAuthTokenRequest {
  access_key: string;
  secret_key: string;
}

export interface MykoboAuthTokenResponse {
  subject_id: string;
  token: string;
  refresh_token: string;
}

export interface MykoboRefreshTokenRequest {
  refresh_token: string;
}

export interface MykoboCreateIntentRequest {
  transaction_type: MykoboTransactionType;
  wallet_address: string;
  email_address: string;
  value: string;
  currency: MykoboCurrency;
  ip_address: string;
  memo?: string;
  client_domain?: string;
}

export interface MykoboTransaction {
  id: string;
  reference: string;
  transaction_type: MykoboTransactionType;
  status: MykoboTransactionStatus | string;
  incoming_currency?: string;
  outgoing_currency?: string;
  value: string;
  fee: string;
  wallet_address: string;
  network: MykoboNetwork | string;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface MykoboDepositInstructions {
  bank_account_name: string;
  iban: string;
}

export interface MykoboWithdrawInstructions {
  address: string;
}

export type MykoboTransactionInstructions = MykoboDepositInstructions | MykoboWithdrawInstructions;

export interface MykoboCreateIntentResponse {
  transaction: MykoboTransaction;
  instructions?: MykoboTransactionInstructions;
}

export interface MykoboGetTransactionResponse {
  transaction: MykoboTransaction;
  instructions?: MykoboTransactionInstructions;
}

export interface MykoboFeeDetail {
  amount: string;
  description: string;
  name: string;
}

export interface MykoboFeeResponse {
  total: string;
  asset?: string;
  percentage?: string;
  details?: MykoboFeeDetail[];
}

export interface MykoboLookupFeesParams {
  value: string;
  kind: MykoboFeeKind;
  client_domain?: string;
}

export interface MykoboProfileKycStatus {
  received_at: string | null;
  review_status: string;
}

export interface MykoboProfile {
  first_name: string;
  last_name: string;
  email_address: string;
  bank_account_number: string;
  kyc_status: MykoboProfileKycStatus;
  created_at: string;
}

export interface MykoboGetProfileResponse {
  profile: MykoboProfile;
}

export interface MykoboErrorResponse {
  error: string;
  fields?: Record<string, string>;
  kyc_status?: MykoboProfileKycStatus | string;
  email_address?: string;
  service?: string;
}

export function isWithdrawInstructions(
  instructions: MykoboTransactionInstructions | undefined
): instructions is MykoboWithdrawInstructions {
  return Boolean(instructions && "address" in instructions);
}
