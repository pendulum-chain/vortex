/**
 * Stellar token configuration
 */

import { FiatToken, TokenType } from "../types/base";
import { StellarTokenDetails } from "../types/stellar";

export const stellarTokenConfig: Partial<Record<FiatToken, StellarTokenDetails>> = {
  [FiatToken.EURC]: {
    anchorHomepageUrl: "https://mykobo.co",
    assetSymbol: "EURC",
    decimals: 12,
    fiat: {
      assetIcon: "eur",
      name: "Euro",
      symbol: "EUR"
    },
    maxBuyAmountRaw: "10000000000000000",
    maxSellAmountRaw: "10000000000000000",
    minBuyAmountRaw: "1000000000000",
    minSellAmountRaw: "10000000000000",
    pendulumRepresentative: {
      assetSymbol: "EURC",
      currency: FiatToken.EURC,
      currencyId: {
        Stellar: {
          AlphaNum4: {
            code: "0x45555243",
            issuer: "0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136"
          }
        }
      },
      decimals: 12,
      erc20WrapperAddress: "6eNUvRWCKE3kejoyrJTXiSM7NxtWi37eRXTnKhGKPsJevAj5"
    },
    sellFeesBasisPoints: 25,
    stellarAsset: {
      code: {
        hex: "0x45555243",
        string: "EURC"
      },
      issuer: {
        hex: "0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136",
        stellarEncoding: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2"
      }
    },
    supportsClientDomain: true,
    tomlFileUrl: "https://stellar.mykobo.co/.well-known/stellar.toml",
    type: TokenType.Stellar,
    usesMemo: false,
    vaultAccountId: "6dgJM1ijyHFEfzUokJ1AHq3z3R3Z8ouc8B5SL9YjMRUaLsjh"
  },
  [FiatToken.ARS]: {
    anchorHomepageUrl: "https://home.anclap.com",
    assetSymbol: "ARS",
    decimals: 12,
    fiat: {
      assetIcon: "ars",
      name: "Argentine Peso",
      symbol: "ARS"
    },
    maxBuyAmountRaw: "500000000000000000",
    maxSellAmountRaw: "500000000000000000",
    minBuyAmountRaw: "11000000000000",
    minSellAmountRaw: "11000000000000",
    pendulumRepresentative: {
      assetSymbol: "ARS",
      currency: FiatToken.ARS,
      currencyId: {
        Stellar: {
          AlphaNum4: {
            code: "0x41525300",
            issuer: "0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1"
          }
        }
      },
      decimals: 12,
      erc20WrapperAddress: "6f7VMG1ERxpZMvFE2CbdWb7phxDgnoXrdornbV3CCd51nFsj"
    },
    sellFeesBasisPoints: 200,
    sellFeesFixedComponent: 10,
    stellarAsset: {
      code: {
        hex: "0x41525300",
        string: "ARS"
      },
      issuer: {
        hex: "0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1",
        stellarEncoding: "GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS"
      }
    }, // 11 ARS
    supportsClientDomain: true, // 500000 ARS
    tomlFileUrl: "https://api.anclap.com/.well-known/stellar.toml", // 2%
    type: TokenType.Stellar, // 10 ARS
    usesMemo: true,
    vaultAccountId: "6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs"
  }
};
