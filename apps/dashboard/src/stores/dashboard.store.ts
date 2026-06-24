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
  /** Activates the account for this email, creating an empty one (→ onboarding CTA) if none exists. */
  signInWithEmail: (email: string) => void;
  /** Adds a corridor to an account's tracked set (no-op if already present). */
  addCorridorToAccount: (accountId: string, corridorId: CorridorId) => void;
  /** Returns the new recipient id so callers can simulate async registration. */
  addRecipient: (input: { accountId: string; corridorId: CorridorId; name: string; destination: string }) => string;
  setRecipientStatus: (id: string, status: Recipient["status"]) => void;
  /** Records a triggered on/off-ramp and returns its id so callers can settle it async. */
  addTransaction: (input: Omit<Transaction, "id" | "createdAt">) => string;
  setTransactionStatus: (id: string, status: Transaction["status"]) => void;
}

/** Derives a readable account name from an email handle (e.g. "ops.team" -> "Ops Team"). */
function accountNameFromEmail(email: string): string {
  const handle = email.split("@")[0] ?? "";
  const name = handle
    .split(/[.\-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return name || "Your business";
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
      signInWithEmail: email =>
        set(state => {
          const existing = state.accounts.find(account => account.identifier === email);
          if (existing) {
            return { activeAccountId: existing.id };
          }
          const id = `acc_${crypto.randomUUID().slice(0, 8)}`;
          const account: SenderAccount = {
            id,
            identifier: email,
            name: accountNameFromEmail(email),
            onboardings: {},
            selectedCorridors: [],
            type: "company"
          };
          return { accounts: [...state.accounts, account], activeAccountId: id };
        }),
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
