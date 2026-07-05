import {
  API,
  checkEvmBalancePeriodically,
  checkEvmNativeBalancePeriodically,
  EvmClientManager,
  EvmNetworks,
  Networks as VortexNetworks
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, erc20Abi, parseTransaction, recoverTransactionAddress, type TransactionSerialized } from "viem";
import { base, polygon } from "viem/chains";
import logger from "../../../../config/logger";
import {
  BASE_EPHEMERAL_STARTING_BALANCE_UNITS,
  GLMR_FUNDING_AMOUNT_RAW,
  PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS,
  POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS
} from "../../../../constants/constants";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";

export async function isPendulumEphemeralFunded(pendulumEphemeralAddress: string, pendulumNode: API): Promise<boolean> {
  const fundingAmountUnits = Big(PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, pendulumNode.decimals).toFixed();
  //@ts-ignore
  const { data: balance } = await pendulumNode.api.query.system.account(pendulumEphemeralAddress);

  return Big(balance.free.toString()).gte(fundingAmountRaw);
}

export async function isMoonbeamEphemeralFunded(moonbeamEphemeralAddress: string, moonbeamNode: API): Promise<boolean> {
  //@ts-ignore
  const { data: balance } = await moonbeamNode.api.query.system.account(moonbeamEphemeralAddress);
  return Big(balance.free.toString()).gte(GLMR_FUNDING_AMOUNT_RAW);
}

export async function isBaseEphemeralFunded(baseEphemeralAddress: string): Promise<boolean> {
  const evmClientManager = EvmClientManager.getInstance();
  const baseClient = evmClientManager.getClient(VortexNetworks.Base);

  const balance = await baseClient.getBalance({
    address: baseEphemeralAddress as `0x${string}`
  });
  const fundingAmountRaw = new Big(
    multiplyByPowerOfTen(BASE_EPHEMERAL_STARTING_BALANCE_UNITS, base.nativeCurrency.decimals).toFixed()
  );

  return Big(balance.toString()).gte(fundingAmountRaw);
}

export async function isPolygonEphemeralFunded(polygonEphemeralAddress: string): Promise<boolean> {
  const evmClientManager = EvmClientManager.getInstance();
  const polygonClient = evmClientManager.getClient(VortexNetworks.Polygon);

  const balance = await polygonClient.getBalance({
    address: polygonEphemeralAddress as `0x${string}`
  });
  const fundingAmountRaw = new Big(
    multiplyByPowerOfTen(POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS, polygon.nativeCurrency.decimals).toFixed()
  );

  return Big(balance.toString()).gte(fundingAmountRaw);
}

// Native-token funding amounts sent to the destination EVM ephemeral so it can pay
// gas for the final destination transfer. Threshold MUST match what is sent in
// `fundDestinationEvmEphemeralAccount`; otherwise the post-funding balance poll
// will spuriously succeed (or fail) and downstream phases may run with a
// short-funded ephemeral.
export const DESTINATION_EVM_FUNDING_AMOUNTS: Record<EvmNetworks, string> = {
  [VortexNetworks.Ethereum]: "0.00016",
  [VortexNetworks.Arbitrum]: "0.000045",
  [VortexNetworks.Base]: "0.000034",
  [VortexNetworks.Polygon]: "0.6",
  [VortexNetworks.BSC]: "0.000115",
  [VortexNetworks.Avalanche]: "0.0034",
  [VortexNetworks.Moonbeam]: "0.34",
  [VortexNetworks.PolygonAmoy]: "0.2",
  [VortexNetworks.BaseSepolia]: "0.000034"
};

export async function isDestinationEvmEphemeralFunded(
  evmEphemeralAddress: string,
  destinationNetwork: EvmNetworks
): Promise<boolean> {
  const evmClientManager = EvmClientManager.getInstance();
  const destinationClient = evmClientManager.getClient(destinationNetwork);
  const chain = destinationClient.chain;
  if (!chain) {
    throw new Error(`isDestinationEvmEphemeralFunded: Could not get chain info for ${destinationNetwork}`);
  }

  const balance = await destinationClient.getBalance({
    address: evmEphemeralAddress as `0x${string}`
  });

  const fundingAmountUnits = DESTINATION_EVM_FUNDING_AMOUNTS[destinationNetwork];
  const fundingAmountRaw = new Big(multiplyByPowerOfTen(fundingAmountUnits, chain.nativeCurrency.decimals).toFixed());

  return Big(balance.toString()).gte(fundingAmountRaw);
}

const PRESIGNED_TRANSFER_BALANCE_POLL_MS = 5000;
const PRESIGNED_TRANSFER_BALANCE_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Guard for broadcasting a presigned single-use transfer: a revert still consumes the fixed
 * nonce, after which the presigned payload can never be re-broadcast and the funds strand on
 * the ephemeral. Decode sender, token and amount from the signed raw transaction and poll until
 * the sender's balance covers the transfer, so a short-funded ephemeral surfaces as a phase
 * error instead of a burned nonce. Decode failures are logged and skipped — this guard must
 * never block a well-formed broadcast path.
 *
 * Rejects with a BalanceCheckError when the balance does not cover the transfer within the
 * timeout (or the balance read fails); callers wrap that in a recoverable phase error.
 */
export async function ensurePresignedTransferFunded(rawTx: `0x${string}`, network: EvmNetworks, phase: string): Promise<void> {
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
        // Not a plain transfer; there is no single balance requirement to assert here.
        return;
      }
      tokenAddress = decoded.to as `0x${string}`;
      amountRaw = args[1];
    }
  } catch (error) {
    logger.warn(`${phase}: could not decode presigned transfer for balance pre-check - ${(error as Error).message}`);
    return;
  }

  if (amountRaw <= 0n) {
    return;
  }

  if (tokenAddress) {
    await checkEvmBalancePeriodically(
      tokenAddress,
      sender,
      amountRaw.toString(),
      PRESIGNED_TRANSFER_BALANCE_POLL_MS,
      PRESIGNED_TRANSFER_BALANCE_TIMEOUT_MS,
      network
    );
  } else {
    await checkEvmNativeBalancePeriodically(
      sender,
      amountRaw.toString(),
      PRESIGNED_TRANSFER_BALANCE_POLL_MS,
      PRESIGNED_TRANSFER_BALANCE_TIMEOUT_MS,
      network
    );
  }
}
