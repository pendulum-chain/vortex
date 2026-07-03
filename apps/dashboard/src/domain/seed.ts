import type { Recipient, SenderAccount, Transaction } from "./types";

/**
 * Seeded demo data: one company onboarded across several corridors and one fresh
 * individual. Statuses are spread so every onboarding, recipient and payout state
 * is visible at a glance.
 */
export const SEED_ACCOUNTS: SenderAccount[] = [
  {
    id: "acc_nordwind",
    identifier: "CNPJ 12.345.678/0001-90",
    name: "Nordwind Logística Ltda",
    onboardings: {
      BR: { corridorId: "BR", kind: "kyb", status: "approved", updatedAt: "2026-06-20T09:30:00.000Z" },
      EU: { corridorId: "EU", kind: "kyb", status: "approved", updatedAt: "2026-06-18T14:05:00.000Z" },
      MX: { corridorId: "MX", kind: "kyb", status: "pending", updatedAt: "2026-06-23T11:20:00.000Z" },
      US: { corridorId: "US", kind: "kyb", status: "not_started", updatedAt: "2026-06-24T08:00:00.000Z" }
    },
    selectedCorridors: ["BR", "EU", "MX", "US"],
    type: "company"
  },
  {
    id: "acc_maria",
    identifier: "CPF •••.•••.789-00",
    name: "Maria Oliveira",
    onboardings: {
      BR: { corridorId: "BR", kind: "kyc", status: "not_started", updatedAt: "2026-06-22T08:00:00.000Z" },
      CO: { corridorId: "CO", kind: "kyc", status: "rejected", updatedAt: "2026-06-22T12:30:00.000Z" },
      EU: { corridorId: "EU", kind: "kyc", status: "pending", updatedAt: "2026-06-21T16:45:00.000Z" }
    },
    selectedCorridors: ["BR", "EU", "CO"],
    type: "individual"
  }
];

/** Recipients carry compliance status only; payout amounts/bank details are captured by the sender. */
export const SEED_RECIPIENTS: Recipient[] = [
  {
    accountId: "acc_nordwind",
    amount: "0.00",
    bankDetails: { method: "pix", value: "Your Brazil PIX account" },
    copyCount: 0,
    corridorId: "BR",
    createdAt: "2026-06-20T09:31:00.000Z",
    email: "",
    id: "rcp_self_br",
    inviteCode: "SELFBR",
    isSelf: true,
    name: "Nordwind Logística Ltda (You)",
    payoutCurrency: "BRL",
    recipientType: "company",
    status: "approved"
  },
  {
    accountId: "acc_nordwind",
    amount: "11040.50",
    bankDetails: { method: "iban", value: "DE89 3704 0044 0532 0130 00" },
    copyCount: 2,
    corridorId: "EU",
    createdAt: "2026-06-19T10:12:00.000Z",
    email: "treasury@hanseatic-trade.de",
    id: "rcp_eu_1",
    inviteCode: "7K2QF9",
    payoutCurrency: "EURC",
    recipientType: "company",
    status: "approved"
  },
  {
    accountId: "acc_nordwind",
    amount: "30000.00",
    bankDetails: { method: "pix", value: "financeiro@nordwind.com.br" },
    copyCount: 1,
    corridorId: "BR",
    createdAt: "2026-06-19T10:15:00.000Z",
    email: "financeiro@nordwind.com.br",
    id: "rcp_br_1",
    inviteCode: "M4XT8B",
    payoutCurrency: "BRL",
    recipientType: "company",
    status: "approved"
  },
  {
    accountId: "acc_nordwind",
    amount: "8500.00",
    bankDetails: { method: "pix", value: "12.345.678/0001-90" },
    copyCount: 1,
    corridorId: "BR",
    createdAt: "2026-06-23T09:40:00.000Z",
    email: "ops@lojaverde.com.br",
    id: "rcp_br_2",
    inviteCode: "QP9R3C",
    payoutCurrency: "BRL",
    recipientType: "company",
    status: "pending"
  },
  {
    accountId: "acc_nordwind",
    amount: "2400.00",
    bankDetails: { method: "iban", value: "" },
    copyCount: 0,
    corridorId: "EU",
    createdAt: "2026-06-24T15:05:00.000Z",
    email: "",
    id: "rcp_eu_2",
    inviteCode: "H6NZ2K",
    payoutCurrency: "EURC",
    recipientType: "individual",
    status: "invite_sent"
  },
  {
    accountId: "acc_nordwind",
    amount: "1500.00",
    bankDetails: { method: "pix", value: "+55 11 99999-0000" },
    copyCount: 3,
    corridorId: "BR",
    createdAt: "2026-06-22T18:20:00.000Z",
    email: "contas@suspeito-ltda.com.br",
    id: "rcp_br_3",
    inviteCode: "B5WD7L",
    payoutCurrency: "BRL",
    recipientType: "individual",
    status: "rejected"
  }
];

/**
 * Mocked payout history: the sender funds a Vortex-created payin wallet, Vortex settles
 * fiat to the recipient bank. Spread across the full lifecycle.
 */
export const SEED_TRANSACTIONS: Transaction[] = [
  {
    accountId: "acc_nordwind",
    amountIn: "12000.00",
    amountInToken: "USDC",
    corridorId: "EU",
    createdAt: "2026-06-21T13:20:00.000Z",
    fiatPayoutAmount: "11040.50",
    id: "tx_nw_1",
    payinNetwork: "polygon",
    payinWallet: "0x9f1c4a2be7d3905f6c8a1d4e2b7f0a3c5d6e8b91",
    payoutCurrency: "EURC",
    recipientEmail: "treasury@hanseatic-trade.de",
    recipientId: "rcp_eu_1",
    status: "completed"
  },
  {
    accountId: "acc_nordwind",
    amountIn: "4500.00",
    amountInToken: "USDC",
    corridorId: "EU",
    createdAt: "2026-06-22T09:05:00.000Z",
    fiatPayoutAmount: "4138.20",
    id: "tx_nw_2",
    payinNetwork: "base",
    payinWallet: "0x3a7d92f10b8e4c6a5d2f9b1e7c0a4d8f6b3e2c15",
    payoutCurrency: "EURC",
    recipientEmail: "treasury@hanseatic-trade.de",
    recipientId: "rcp_eu_1",
    status: "processing"
  },
  {
    accountId: "acc_nordwind",
    amountIn: "5483.00",
    amountInToken: "USDC",
    corridorId: "BR",
    createdAt: "2026-06-23T16:30:00.000Z",
    fiatPayoutAmount: "30000.00",
    id: "tx_nw_3",
    payinNetwork: "arbitrum",
    payinWallet: "0x71b0e8d4f2a6c9351e7b0d8a4f2c6e9b1d5a3f08",
    payoutCurrency: "BRL",
    recipientEmail: "financeiro@nordwind.com.br",
    recipientId: "rcp_br_1",
    status: "awaiting_payin"
  },
  {
    accountId: "acc_nordwind",
    amountIn: "1463.00",
    amountInToken: "USDC",
    corridorId: "BR",
    createdAt: "2026-06-20T11:00:00.000Z",
    failureReason: "Recipient bank rejected the payout (account name mismatch).",
    fiatPayoutAmount: "8000.00",
    id: "tx_nw_4",
    payinNetwork: "ethereum",
    payinWallet: "0x5d2a9c7f0e4b6831a9d7f0c4e2b6a8d1f3c5e709",
    payoutCurrency: "BRL",
    recipientEmail: "financeiro@nordwind.com.br",
    recipientId: "rcp_br_1",
    status: "failed"
  }
];
