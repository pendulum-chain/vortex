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
  receivingContractAddress: '0x0004446021fe650c15fb0b2e046b39130e3bfe36', // '0x388b695805aad4dca5f8504cc40932d57f8f2aa0', //'0x63725b1608b359b9f4654b81dd5e3f716de5f55f', //'0x043beed27614610ae773211b36f79f5343622de2', // '0x066d12e8f155c87a87d9db96eac0594e872c16b2',
};
