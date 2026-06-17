import { API, EvmClientManager, EvmNetworks, Networks as VortexNetworks } from "@vortexfi/shared";
import Big from "big.js";
import { base, polygon } from "viem/chains";
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
  [VortexNetworks.Ethereum]: "0.005",
  [VortexNetworks.Arbitrum]: "0.0001",
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
