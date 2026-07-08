import type { SenderAccount, Transaction } from "./types";

/**
 * Seeded demo data: one company onboarded across several corridors and one fresh
 * individual. Statuses are spread so every onboarding and payout state is visible
 * at a glance. Recipients are no longer seeded — they come from the backend
 * (third-party) and from fetched payout accounts (self).
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
