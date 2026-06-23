import type { Recipient, SenderAccount, Transaction } from "./types";

/**
 * Seeded demo data: one company (mid-KYB in Brazil, approved in Europe) and one
 * fresh individual. Spread of statuses so every state is visible at a glance.
 */
export const SEED_ACCOUNTS: SenderAccount[] = [
  {
    id: "acc_nordwind",
    identifier: "CNPJ 12.345.678/0001-90",
    name: "Nordwind Logística Ltda",
    onboardings: {
      BR: { corridorId: "BR", kind: "kyb", status: "approved", updatedAt: "2026-06-20T09:30:00.000Z" },
      EU: { corridorId: "EU", kind: "kyc", status: "approved", updatedAt: "2026-06-18T14:05:00.000Z" }
    },
    selectedCorridors: ["BR", "EU"],
    type: "company"
  },
  {
    id: "acc_maria",
    identifier: "CPF •••.•••.789-00",
    name: "Maria Oliveira",
    onboardings: {
      BR: { corridorId: "BR", kind: "kyc", status: "not_started", updatedAt: "2026-06-22T08:00:00.000Z" },
      EU: { corridorId: "EU", kind: "kyc", status: "pending", updatedAt: "2026-06-21T16:45:00.000Z" }
    },
    selectedCorridors: ["BR", "EU"],
    type: "individual"
  }
];

/**
 * Mocked transaction history, keyed per account (the dashboard tracks history per
 * account; the widget tracks it per wallet). Spread across on/off-ramp and statuses.
 */
export const SEED_TRANSACTIONS: Transaction[] = [
  {
    accountId: "acc_nordwind",
    corridorId: "EU",
    counterparty: "Hanseatic Trade GmbH",
    createdAt: "2026-06-21T13:20:00.000Z",
    direction: "offramp",
    fromAmount: "12000.00",
    fromCurrency: "USDC",
    id: "tx_nw_1",
    status: "completed",
    toAmount: "11040.50",
    toCurrency: "EURC"
  },
  {
    accountId: "acc_nordwind",
    corridorId: "EU",
    counterparty: "Hanseatic Trade GmbH",
    createdAt: "2026-06-22T09:05:00.000Z",
    direction: "offramp",
    fromAmount: "4500.00",
    fromCurrency: "USDC",
    id: "tx_nw_2",
    status: "processing",
    toAmount: "4138.20",
    toCurrency: "EURC"
  },
  {
    accountId: "acc_nordwind",
    corridorId: "BR",
    counterparty: "Nubank ••• 4471",
    createdAt: "2026-06-19T11:00:00.000Z",
    direction: "onramp",
    fromAmount: "30000.00",
    fromCurrency: "BRL",
    id: "tx_nw_3",
    status: "completed",
    toAmount: "5480.00",
    toCurrency: "USDC"
  },
  {
    accountId: "acc_nordwind",
    corridorId: "BR",
    counterparty: "Nubank ••• 4471",
    createdAt: "2026-06-22T16:30:00.000Z",
    direction: "onramp",
    fromAmount: "8000.00",
    fromCurrency: "BRL",
    id: "tx_nw_4",
    status: "failed",
    toAmount: "1461.00",
    toCurrency: "USDC"
  },
  {
    accountId: "acc_maria",
    corridorId: "BR",
    counterparty: "Itaú ••• 1180",
    createdAt: "2026-06-20T15:42:00.000Z",
    direction: "onramp",
    fromAmount: "2500.00",
    fromCurrency: "BRL",
    id: "tx_mo_1",
    status: "completed",
    toAmount: "456.30",
    toCurrency: "USDC"
  },
  {
    accountId: "acc_maria",
    corridorId: "EU",
    counterparty: "Lisbon Studios Lda",
    createdAt: "2026-06-21T10:15:00.000Z",
    direction: "offramp",
    fromAmount: "600.00",
    fromCurrency: "USDC",
    id: "tx_mo_2",
    status: "completed",
    toAmount: "551.80",
    toCurrency: "EURC"
  }
];

export const SEED_RECIPIENTS: Recipient[] = [
  {
    accountId: "acc_nordwind",
    corridorId: "EU",
    createdAt: "2026-06-19T10:12:00.000Z",
    destination: "DE89 3704 0044 0532 0130 00",
    id: "rcp_eu_1",
    method: "iban",
    name: "Hanseatic Trade GmbH",
    status: "registered"
  },
  {
    accountId: "acc_nordwind",
    corridorId: "BR",
    createdAt: "2026-06-19T10:15:00.000Z",
    destination: "financeiro@nordwind.com.br",
    id: "rcp_br_1",
    method: "pix",
    name: "Nordwind Folha de Pagamento",
    status: "registered"
  }
];
