export interface TokenDetails {
  tomlFileUrl: string;
  assetCode: string;
  assetIssuer: string;
  vaultAccountId: string;
  minWithdrawalAmount: string;
  assetCodeHex?: string;  // Optional property
}

export interface TokenConfig {
  [key: string]: TokenDetails;
}


export const TOKEN_CONFIG: TokenConfig = {
      brl: {
        tomlFileUrl: "https://ntokens.com/.well-known/stellar.toml",
        assetCode: "BRL",
        assetIssuer: "GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP",
        vaultAccountId: "6g7fKQQZ9VfbBTQSaKBcATV4psApFra5EDwKLARFZCCVnSWS",
        //todo tbc minWithdrawalAmount for this asset
        minWithdrawalAmount: '10000000000000',
        assetCodeHex: "0x42524c00",
      },
      eurc: {
        tomlFileUrl: "https://mykobo.co/.well-known/stellar.toml",
        assetCode: "EURC",
        assetIssuer: "GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM",
        vaultAccountId: "6bsD97dS8ZyomMmp1DLCnCtx25oABtf19dypQKdZe6FBQXSm",
        minWithdrawalAmount: '10000000000000'
      },
};

