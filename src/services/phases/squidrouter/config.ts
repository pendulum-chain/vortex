import { getNetworkId, Networks } from '../../../helpers/networks';

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
  toChainId: '1284',
  axlUSDC_MOONBEAM: '0xca01a1d0993565291051daff390892518acfad3a',
  integratorId: 'pendulum-7cffebc5-f84f-4669-96b4-4f8c82640811',
  receivingContractAddress: '0x2AB52086e8edaB28193172209407FF9df1103CDc',
};

export function getSquidRouterConfig(network: Networks): Config {
  const networkId = getNetworkId(network);
  if (!networkId) {
    throw new Error('getSquidRouterConfig: Network must be EVM to support SquidRouter');
  }
  return {
    fromChainId: networkId.toString(),
    toChainId: squidRouterConfigBase.toChainId,
    axlUSDC_MOONBEAM: squidRouterConfigBase.axlUSDC_MOONBEAM,
    integratorId: squidRouterConfigBase.integratorId,
    receivingContractAddress: squidRouterConfigBase.receivingContractAddress,
  };
}
