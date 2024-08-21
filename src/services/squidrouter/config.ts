import { INPUT_TOKEN_CONFIG, InputTokenDetails } from '../../constants/tokenConfig';

interface Config {
  fromChainId: string;
  toChainId: string;
  fromToken: `0x${string}`;
  axlUSDC_MOONBEAM: string;
  integratorId: string;
  receivingContractAddress: string;
}

export function getSquidRouterConfig(inputToken: InputTokenDetails): Config {
  return {
    fromChainId: '137',
    toChainId: '1284',
    fromToken: inputToken.erc20AddressSourceChain as `0x${string}`,
    axlUSDC_MOONBEAM: '0xca01a1d0993565291051daff390892518acfad3a',
    integratorId: 'pendulum-7cffebc5-f84f-4669-96b4-4f8c82640811',
    receivingContractAddress: '0x066d12e8f155c87a87d9db96eac0594e872c16b2',
  };
}
