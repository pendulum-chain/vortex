interface Config {
  fromChainId: string;
  toChainId: string;
  fromToken: `0x${string}`;
  axlUSDC_MOONBEAM: string;
  integratorId: string;
  amount: string;
  receivingContractAddress: string;
}

export function getSquidRouterConfig(): Config {
  return {
    fromChainId: '137',
    toChainId: '1284',
    fromToken: '0x750e4c4984a9e0f12978ea6742bc1c5d248f40ed',
    axlUSDC_MOONBEAM: '0xca01a1d0993565291051daff390892518acfad3a',
    integratorId: 'pendulum-2d38434b-db9e-49ec-b455-383a874e4b69',
    amount: '100000',
    receivingContractAddress: '0x7d1024e467655e3ed371529ebf5ffc07438ddb3c',
  };
}
