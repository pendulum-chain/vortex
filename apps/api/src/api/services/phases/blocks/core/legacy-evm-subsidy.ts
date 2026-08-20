import { decodeFunctionData, erc20Abi, isAddressEqual } from "viem";
import type FinancialOperation from "../../../../../models/financialOperation.model";

interface LegacyEvmTransaction {
  from: `0x${string}`;
  input: `0x${string}`;
  to: `0x${string}` | null;
}

interface ReconcileLegacyEvmSubsidyArgs {
  destination: `0x${string}`;
  getTransaction(hash: `0x${string}`): Promise<LegacyEvmTransaction>;
  operation: FinancialOperation;
  source: `0x${string}`;
  targetBalanceRaw: string;
  token: `0x${string}`;
}

export interface EvmSubsidyOperationResult {
  amountRaw: string;
  hash: `0x${string}` | null;
}

function getLegacyTransactionHash(response: unknown): `0x${string}` | null {
  if (!response || typeof response !== "object" || !("hash" in response)) return null;
  if ("amountRaw" in response) return null;
  const { hash } = response as { hash?: unknown };
  return typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash) ? (hash as `0x${string}`) : null;
}

/** Verifies and enriches a pre-target-authorization subsidy result from its mined ERC-20 transfer. */
export async function reconcileLegacyEvmSubsidy({
  destination,
  getTransaction,
  operation,
  source,
  targetBalanceRaw,
  token
}: ReconcileLegacyEvmSubsidyArgs): Promise<EvmSubsidyOperationResult | null> {
  const hash = getLegacyTransactionHash(operation.response);
  if (!hash) return null;

  const transaction = await getTransaction(hash);
  if (transaction.to === null || !isAddressEqual(transaction.from, source) || !isAddressEqual(transaction.to, token)) {
    return null;
  }

  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.input });
    if (decoded.functionName !== "transfer" || decoded.args?.length !== 2) return null;
    const [recipient, amountRaw] = decoded.args as readonly [`0x${string}`, bigint];
    if (!isAddressEqual(recipient, destination) || amountRaw <= 0n || amountRaw > BigInt(targetBalanceRaw)) {
      return null;
    }
    return { amountRaw: amountRaw.toString(), hash };
  } catch {
    return null;
  }
}
