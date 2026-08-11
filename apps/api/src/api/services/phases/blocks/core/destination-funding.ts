import {
  API,
  checkEvmBalancePeriodically,
  checkEvmNativeBalancePeriodically,
  EvmClientManager,
  EvmNetworks,
  isNetworkEVM,
  Networks
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, erc20Abi, parseTransaction, recoverTransactionAddress, type TransactionSerialized } from "viem";
import { base, polygon } from "viem/chains";
import logger from "../../../../../config/logger";
import {
  BASE_EPHEMERAL_STARTING_BALANCE_UNITS,
  GLMR_FUNDING_AMOUNT_RAW,
  PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS,
  POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS
} from "../../../../../constants/constants";
import { UnrecoverablePhaseError } from "../../../../errors/phase-error";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";

// Compatibility program for quotes created before dynamic destination funding
// metadata existed. Keep these values and operation identities stable until all
// such quotes/ramps have expired or completed.
export const LEGACY_DESTINATION_EVM_FUNDING_AMOUNTS: Record<EvmNetworks, string> = {
  [Networks.Arbitrum]: "0.0002",
  [Networks.Avalanche]: "0.0034",
  [Networks.Base]: "0.000034",
  [Networks.BaseSepolia]: "0.000034",
  [Networks.BSC]: "0.000115",
  [Networks.Ethereum]: "0.005",
  [Networks.Moonbeam]: "0.34",
  [Networks.Polygon]: "0.6",
  [Networks.PolygonAmoy]: "0.2"
};

export async function isPendulumEphemeralFunded(pendulumEphemeralAddress: string, pendulumNode: API): Promise<boolean> {
  const fundingAmountUnits = Big(PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, pendulumNode.decimals).toFixed();
  // @ts-ignore
  const { data: balance } = await pendulumNode.api.query.system.account(pendulumEphemeralAddress);

  return Big(balance.free.toString()).gte(fundingAmountRaw);
}

export async function isMoonbeamEphemeralFunded(moonbeamEphemeralAddress: string, moonbeamNode: API): Promise<boolean> {
  // @ts-ignore
  const { data: balance } = await moonbeamNode.api.query.system.account(moonbeamEphemeralAddress);
  return Big(balance.free.toString()).gte(GLMR_FUNDING_AMOUNT_RAW);
}

export async function isBaseEphemeralFunded(baseEphemeralAddress: string): Promise<boolean> {
  const baseClient = EvmClientManager.getInstance().getClient(Networks.Base);
  const balance = await baseClient.getBalance({ address: baseEphemeralAddress as `0x${string}` });
  const fundingAmountRaw = new Big(
    multiplyByPowerOfTen(BASE_EPHEMERAL_STARTING_BALANCE_UNITS, base.nativeCurrency.decimals).toFixed()
  );

  return Big(balance.toString()).gte(fundingAmountRaw);
}

export async function isPolygonEphemeralFunded(polygonEphemeralAddress: string): Promise<boolean> {
  const polygonClient = EvmClientManager.getInstance().getClient(Networks.Polygon);
  const balance = await polygonClient.getBalance({ address: polygonEphemeralAddress as `0x${string}` });
  const fundingAmountRaw = new Big(
    multiplyByPowerOfTen(POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS, polygon.nativeCurrency.decimals).toFixed()
  );

  return Big(balance.toString()).gte(fundingAmountRaw);
}

export function calculateDestinationFundingShortfallRaw(requiredFundingRaw: bigint, currentBalanceRaw: bigint): bigint {
  return requiredFundingRaw > currentBalanceRaw ? requiredFundingRaw - currentBalanceRaw : 0n;
}

export function calculateSourceEvmFundingRequirementRaw(
  fixedFundingRaw: bigint,
  plannedNativeValueRaw: bigint,
  sameNetworkDestinationLiabilityRaw = 0n
): bigint {
  // A same-chain payout spends from the same balance as the source phases, so its signed
  // fee liability must remain additive instead of reusing the fixed source reserve.
  return fixedFundingRaw + plannedNativeValueRaw + sameNetworkDestinationLiabilityRaw;
}

export function getDynamicDestinationEvmFundingNetwork(
  destinationNetwork: Networks | undefined,
  isBuy: boolean,
  isDirectTransfer: boolean | undefined
): EvmNetworks | undefined {
  // Direct provider-mint flows intentionally have no destination fee envelope. Their
  // execution therefore keeps the existing fixed source reserve rather than adding an
  // unquoted dynamic treasury transfer.
  if (!isBuy || isDirectTransfer === true || !destinationNetwork || !isNetworkEVM(destinationNetwork)) {
    return undefined;
  }

  return destinationNetwork;
}

export async function isDestinationEvmEphemeralFunded(
  evmEphemeralAddress: string,
  destinationNetwork: EvmNetworks,
  requiredFundingRaw: bigint
): Promise<boolean> {
  const destinationClient = EvmClientManager.getInstance().getClient(destinationNetwork);
  const chain = destinationClient.chain;
  if (!chain) {
    throw new Error(`isDestinationEvmEphemeralFunded: Could not get chain info for ${destinationNetwork}`);
  }

  const balance = await destinationClient.getBalance({ address: evmEphemeralAddress as `0x${string}` });
  return Big(balance.toString()).gte(requiredFundingRaw.toString());
}

const PRESIGNED_TRANSFER_BALANCE_POLL_MS = 5000;
const PRESIGNED_TRANSFER_BALANCE_TIMEOUT_MS = 3 * 60 * 1000;

export async function ensurePresignedTransferFunded(
  rawTx: `0x${string}`,
  network: EvmNetworks,
  phase: string,
  signal?: AbortSignal
): Promise<void> {
  let sender: `0x${string}`;
  let tokenAddress: `0x${string}` | undefined;
  let amountRaw: bigint;

  try {
    const decoded = parseTransaction(rawTx);
    sender = (await recoverTransactionAddress({ serializedTransaction: rawTx as TransactionSerialized })) as `0x${string}`;

    if (!decoded.data || decoded.data === "0x") {
      amountRaw = decoded.value ?? 0n;
    } else {
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: decoded.data });
      if (functionName !== "transfer" || !decoded.to) {
        throw new Error(`expected an ERC-20 transfer, got ${functionName}`);
      }
      tokenAddress = decoded.to as `0x${string}`;
      amountRaw = args[1];
    }
  } catch (error) {
    logger.error(`${phase}: invalid server-generated presigned payout transfer - ${(error as Error).message}`);
    throw new UnrecoverablePhaseError(
      `${phase}: server-generated presigned payout transfer could not be validated: ${(error as Error).message}`
    );
  }

  if (amountRaw <= 0n) {
    throw new UnrecoverablePhaseError(`${phase}: server-generated presigned payout transfer has no positive value`);
  }

  if (tokenAddress) {
    await checkEvmBalancePeriodically(
      tokenAddress,
      sender,
      amountRaw.toString(),
      PRESIGNED_TRANSFER_BALANCE_POLL_MS,
      PRESIGNED_TRANSFER_BALANCE_TIMEOUT_MS,
      network,
      signal
    );
  } else {
    await checkEvmNativeBalancePeriodically(
      sender,
      amountRaw.toString(),
      PRESIGNED_TRANSFER_BALANCE_POLL_MS,
      PRESIGNED_TRANSFER_BALANCE_TIMEOUT_MS,
      network,
      signal
    );
  }
}
