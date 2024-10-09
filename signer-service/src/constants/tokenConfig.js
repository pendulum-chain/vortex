const TOKEN_CONFIG = {
  eurc: {
    tomlFileUrl: 'https://circle.anchor.mykobo.co/.well-known/stellar.toml',
    assetCode: 'EURC',
    assetIssuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
    vaultAccountId: '6bsD97dS8ZyomMmp1DLCnCtx25oABtf19dypQKdZe6FBQXSm',
    minWithdrawalAmount: '10000000000000',
    maximumSubsidyAmountRaw: '1000000000000', // 1 unit
  },
  'usdc.axl': {
    pendulumCurrencyId: { XCM: 12 },
    decimals: 6,
    maximumSubsidyAmountRaw: '1000000', // 1 unit
  },
  ars: {
    tomlFileUrl: 'https://api.anclap.com/.well-known/stellar.toml',
    assetCode: 'ARS\0',
    assetIssuer: 'GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS',
    vaultAccountId: '6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs',
    minWithdrawalAmount: '10000000000000',
    maximumSubsidyAmountRaw: '100000000000000', // 100 unit ~ 0.1 USD @ Oct/2024
  },
};

function getTokenConfigByAssetCode(cofig, assetCode) {
  for (const key in cofig) {
    if (cofig[key].assetCode === assetCode) {
      return cofig[key];
    }
  }
  return undefined;
}

module.exports = { TOKEN_CONFIG, getTokenConfigByAssetCode };
