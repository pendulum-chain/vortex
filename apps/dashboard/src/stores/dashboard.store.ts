import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CORRIDORS, onboardingKindFor } from "@/domain/corridors";
import { SEED_ACCOUNTS, SEED_RECIPIENTS, SEED_TRANSACTIONS } from "@/domain/seed";
import type {
  AccountType,
  CorridorId,
  Onboarding,
  OnboardingStatus,
  Recipient,
  RecipientMethod,
  SenderAccount,
  Transaction
} from "@/domain/types";

interface DashboardState {
  accounts: SenderAccount[];
  recipients: Recipient[];
  transactions: Transaction[];
  activeAccountId: string;
  setActiveAccount: (id: string) => void;
  setOnboardingStatus: (accountId: string, corridorId: CorridorId, status: OnboardingStatus) => void;
  /** Creates a new account from registration and returns its id. */
  createAccount: (input: { name: string; type: AccountType; identifier: string; selectedCorridors: CorridorId[] }) => string;
  /** Adds a corridor to an account's tracked set (no-op if already present). */
  addCorridorToAccount: (accountId: string, corridorId: CorridorId) => void;
  /** Returns the new recipient id so callers can simulate async registration. */
  addRecipient: (input: { accountId: string; corridorId: CorridorId; name: string; destination: string }) => string;
  setRecipientStatus: (id: string, status: Recipient["status"]) => void;
  /** Records a triggered on/off-ramp and returns its id so callers can settle it async. */
  addTransaction: (input: Omit<Transaction, "id" | "createdAt">) => string;
  setTransactionStatus: (id: string, status: Transaction["status"]) => void;
}

function makeOnboarding(corridorId: CorridorId, accountType: AccountType): Onboarding {
  return {
    corridorId,
    kind: onboardingKindFor(CORRIDORS[corridorId], accountType),
    status: "not_started",
    updatedAt: new Date().toISOString()
  };
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    set => ({
      accounts: SEED_ACCOUNTS,
      activeAccountId: SEED_ACCOUNTS[0]?.id ?? "",
      addCorridorToAccount: (accountId, corridorId) =>
        set(state => ({
          accounts: state.accounts.map(account => {
            if (account.id !== accountId || account.selectedCorridors.includes(corridorId)) {
              return account;
            }
            return {
              ...account,
              onboardings: { ...account.onboardings, [corridorId]: makeOnboarding(corridorId, account.type) },
              selectedCorridors: [...account.selectedCorridors, corridorId]
            };
          })
        })),
      addRecipient: input => {
        const method: RecipientMethod = CORRIDORS[input.corridorId].recipientMethod;
        const recipient: Recipient = {
          accountId: input.accountId,
          corridorId: input.corridorId,
          createdAt: new Date().toISOString(),
          destination: input.destination,
          id: crypto.randomUUID(),
          method,
          name: input.name,
          status: "pending"
        };
        set(state => ({ recipients: [recipient, ...state.recipients] }));
        return recipient.id;
      },
      addTransaction: input => {
        const transaction: Transaction = { ...input, createdAt: new Date().toISOString(), id: crypto.randomUUID() };
        set(state => ({ transactions: [transaction, ...state.transactions] }));
        return transaction.id;
      },
      createAccount: input => {
        const id = `acc_${crypto.randomUUID().slice(0, 8)}`;
        const onboardings: SenderAccount["onboardings"] = {};
        for (const corridorId of input.selectedCorridors) {
          onboardings[corridorId] = makeOnboarding(corridorId, input.type);
        }
        const account: SenderAccount = {
          id,
          identifier: input.identifier,
          name: input.name,
          onboardings,
          selectedCorridors: input.selectedCorridors,
          type: input.type
        };
        set(state => ({ accounts: [...state.accounts, account], activeAccountId: id }));
        return id;
      },
      recipients: SEED_RECIPIENTS,
      setActiveAccount: id => set({ activeAccountId: id }),
      setOnboardingStatus: (accountId, corridorId, status) =>
        set(state => ({
          accounts: state.accounts.map(account => {
            if (account.id !== accountId) {
              return account;
            }
            const existing = account.onboardings[corridorId];
            if (!existing) {
              return account;
            }
            return {
              ...account,
              onboardings: {
                ...account.onboardings,
                [corridorId]: { ...existing, status, updatedAt: new Date().toISOString() }
              }
            };
          })
        })),
      setRecipientStatus: (id, status) =>
        set(state => ({
          recipients: state.recipients.map(recipient => (recipient.id === id ? { ...recipient, status } : recipient))
        })),
      setTransactionStatus: (id, status) =>
        set(state => ({
          transactions: state.transactions.map(transaction =>
            transaction.id === id ? { ...transaction, status } : transaction
          )
        })),
      transactions: SEED_TRANSACTIONS
    }),
    {
      // v2 reloads the seed so Nordwind's KYB-approved Brazil corridor (which unlocks
      // international transfers) replaces any stale persisted onboarding state.
      migrate: () => ({
        accounts: SEED_ACCOUNTS,
        activeAccountId: SEED_ACCOUNTS[0]?.id ?? "",
        recipients: SEED_RECIPIENTS,
        transactions: SEED_TRANSACTIONS
      }),
      name: "vortex-dashboard-data",
      partialize: state => ({
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
        recipients: state.recipients,
        transactions: state.transactions
      }),
      version: 2
    }
  )
);
