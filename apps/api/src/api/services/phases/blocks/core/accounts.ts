import { type AccountMeta, EphemeralAccountType } from "@vortexfi/shared";
import type { AccountCapabilities } from "./types";

export function accountCapabilities(accounts: readonly AccountMeta[]): AccountCapabilities {
  return Object.fromEntries(accounts.map(account => [account.type, account]));
}

export function requireAccount<Type extends EphemeralAccountType>(
  accounts: AccountCapabilities,
  type: Type
): AccountMeta & { type: Type } {
  const account = accounts[type];
  if (!account) {
    throw new Error(`Block flow transaction preparation requires a ${type} ephemeral account`);
  }
  return account as AccountMeta & { type: Type };
}
