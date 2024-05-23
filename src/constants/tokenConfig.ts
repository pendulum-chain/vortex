export interface TokenDetails {
  currencyId: any;
  isOfframp: boolean;
  decimals: number;
  erc20Address?: string;
  assetCode: string;
  assetIssuer?: string;
  canSwapTo: string[];
  // optional depending if the asset is allowd to be offramped
  tomlFileUrl?: string;
  vaultAccountId?: string;
  minWithdrawalAmount?: string;
  assetCodeHex?: string;  // Optional property
}

export interface TokenConfig {
  [key: string]: TokenDetails;
}

// Every asset specified in here must either be offrampable or be swapable to an offrampable asset
export const TOKEN_CONFIG: TokenConfig = {
      brl: {
        tomlFileUrl: "https://ntokens.com/.well-known/stellar.toml",
        isOfframp: true,
        decimals: 12,
        currencyId: {
          Stellar: { AlphaNum4: { code: "0x42524c00", issuer: "0xeaac68d4d0e37b4c24c2536916e830735f032d0d6b2a1c8fca3bc5a25e083e3a" } },
        },
        assetCode: "BRL",
        canSwapTo: ["usdt", "eurc"],
        assetIssuer: "GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP",
        vaultAccountId: "6g7fKQQZ9VfbBTQSaKBcATV4psApFra5EDwKLARFZCCVnSWS",
        //todo tbc minWithdrawalAmount for this asset
        minWithdrawalAmount: '10000000000000',
        assetCodeHex: "0x42524c00",
        erc20Address: "6dZCR7KVmrcxBoUTcM3vUgpQagQAW2wg2izMrT3N4reftwW5",
      },
      eurc: {
        tomlFileUrl: "https://mykobo.co/.well-known/stellar.toml",
        isOfframp: true,
        decimals: 10,
        currencyId: {XCM: 3},
        canSwapTo: ["usdt", "brl"],
        assetCode: "EURC",
        assetIssuer: "GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM",
        vaultAccountId: "6bsD97dS8ZyomMmp1DLCnCtx25oABtf19dypQKdZe6FBQXSm",
        erc20Address: "6jasFwu3L9YEwVvB98Mcr8N4kEBxwVWdi31bc5k9iux5PgJw",
        minWithdrawalAmount: '100'
      },
      usdt: {
        assetCode: "USDT",
        currencyId: {XCM: 0},
        decimals: 7,
        canSwapTo: ["brl", "eurc"],
        isOfframp: false,
        erc20Address: "6hiUVSFUat7pSK8H8FW7FkPFR49Hw9uRnPT5BzwSZAJgxPfa",
      },
};




