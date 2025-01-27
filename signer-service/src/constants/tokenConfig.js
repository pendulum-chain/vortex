const TOKEN_CONFIG = {
  eurc: {
    tomlFileUrl: 'https://circle.anchor.mykobo.co/.well-known/stellar.toml',
    assetCode: 'EURC',
    assetIssuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
    vaultAccountId: '6bsD97dS8ZyomMmp1DLCnCtx25oABtf19dypQKdZe6FBQXSm',
    minWithdrawalAmount: '10000000000000',
    maximumSubsidyAmountRaw: '4000000000000', // 4 units
    homeDomain: 'circle.anchor.mykobo.co',
    clientDomainEnabled: true,
    memoEnabled: false,
    pendulumCurrencyId: {
      Stellar: {
        AlphaNum4: {
          code: '0x45555243',
          issuer: '0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136',
        },
      },
    },
  },
  'usdc.axl': {
    pendulumCurrencyId: { XCM: 12 },
    decimals: 6,
    maximumSubsidyAmountRaw: '4000000', // 4 units
  },
  usdc: {
    pendulumCurrencyId: { XCM: 2 },
    decimals: 6,
    maximumSubsidyAmountRaw: '4000000', // 4 units
  },
  ars: {
    tomlFileUrl: 'https://api.anclap.com/.well-known/stellar.toml',
    assetCode: 'ARS',
    assetIssuer: 'GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS',
    vaultAccountId: '6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs',
    minWithdrawalAmount: '11000000000000', //  11 ARS. Anchor minimum limit.
    maximumSubsidyAmountRaw: '4000000000000000', // Defined by us:  4000 unit ~ 4 USD @ Jan/2025
    homeDomain: 'api.anclap.com',
    clientDomainEnabled: true,
    memoEnabled: true,
    pendulumCurrencyId: {
      Stellar: {
        AlphaNum4: {
          code: '0x41525300',
          issuer: '0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1',
        },
      },
    },
  },
};

function getTokenConfigByAssetCode(config, assetCode) {
  for (const key in config) {
    if (config[key].assetCode === assetCode) {
      return config[key];
    }
  }
  return undefined;
}

function getPaddedAssetCode(assetCode) {
  return assetCode.padEnd(4, '\0');
}

module.exports = { TOKEN_CONFIG, getTokenConfigByAssetCode, getPaddedAssetCode };
