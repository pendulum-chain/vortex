import { AXL_USDC_MOONBEAM, getNetworkId, Networks } from "@packages/shared";

export const SQUIDROUTER_FEE_OVERPAY = 0.25; // 25% overpayment
export const MOONBEAM_SQUIDROUTER_SWAP_MIN_VALUE_RAW = "10000000000000000"; // 0.01 GLMR in raw units

interface ConfigBase {
  toChainId: string;
  axlUSDC_MOONBEAM: string;
  integratorId: string;
  receivingContractAddress: `0x${string}`;
}

interface Config extends ConfigBase {
  fromChainId: string;
}

export const squidRouterConfigBase: ConfigBase = {
  axlUSDC_MOONBEAM: AXL_USDC_MOONBEAM,
  integratorId: "pendulum-7cffebc5-f84f-4669-96b4-4f8c82640811",
  receivingContractAddress: "0x2AB52086e8edaB28193172209407FF9df1103CDc",
  toChainId: getNetworkId(Networks.Moonbeam).toString()
};

export function getSquidRouterConfig(network: Networks): Config {
  const networkId = getNetworkId(network);
  if (!networkId) {
    throw new Error("getSquidRouterConfig: Network must be EVM to support SquidRouter");
  }
  return {
    axlUSDC_MOONBEAM: squidRouterConfigBase.axlUSDC_MOONBEAM,
    fromChainId: networkId.toString(),
    integratorId: squidRouterConfigBase.integratorId,
    receivingContractAddress: squidRouterConfigBase.receivingContractAddress,
    toChainId: squidRouterConfigBase.toChainId
  };
}
