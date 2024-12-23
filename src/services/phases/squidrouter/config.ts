interface Config {
  fromChainId: string;
  toChainId: string;
  axlUSDC_MOONBEAM: string;
  integratorId: string;
  receivingContractAddress: `0x${string}`;
}

export const squidRouterConfig: Config = {
  fromChainId: '137',
  toChainId: '1284',
  axlUSDC_MOONBEAM: '0xca01a1d0993565291051daff390892518acfad3a',
  integratorId: 'pendulum-7cffebc5-f84f-4669-96b4-4f8c82640811',
  receivingContractAddress: '0x2AB52086e8edaB28193172209407FF9df1103CDc',
};
