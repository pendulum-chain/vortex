/**
 * Stellar token configuration
 */

import { getTomlFileUrl } from "../tokenConfig";
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
    minSellAmountRaw: "25000000000000",
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
    tomlFileUrl: getTomlFileUrl("EURC"),
    type: TokenType.Stellar,
    usesMemo: false,
    vaultAccountId: "6dgJM1ijyHFEfzUokJ1AHq3z3R3Z8ouc8B5SL9YjMRUaLsjh"
  }
};
