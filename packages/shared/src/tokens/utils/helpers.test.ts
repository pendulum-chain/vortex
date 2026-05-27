import { describe, expect, it } from "bun:test";
import { Networks } from "../../helpers";
import {
  ERC20_EURE_POLYGON_DECIMALS,
  ERC20_EURE_POLYGON_TOKEN_NAME,
  ERC20_EURE_POLYGON_V1,
  ERC20_EURE_POLYGON_V2
} from "../constants/misc";
import { evmTokenConfig } from "../evm/config";
import { EvmToken } from "../types/evm";
import { getEvmTokenDetailsByAddress } from "./helpers";

describe("getEvmTokenDetailsByAddress", () => {
  it("resolves configured EVM tokens by contract address", () => {
    const polygonUsdc = evmTokenConfig[Networks.Polygon][EvmToken.USDC];
    expect(polygonUsdc).toBeDefined();
    if (!polygonUsdc) {
      throw new Error("Polygon USDC test fixture is missing");
    }

    const tokenDetails = getEvmTokenDetailsByAddress(Networks.Polygon, polygonUsdc.erc20AddressSourceChain);

    expect(tokenDetails).toEqual(polygonUsdc);
  });

  it("resolves Monerium EUR.e Polygon contracts by address", () => {
    for (const tokenAddress of [ERC20_EURE_POLYGON_V1, ERC20_EURE_POLYGON_V2]) {
      const tokenDetails = getEvmTokenDetailsByAddress(Networks.Polygon, tokenAddress);

      expect(tokenDetails?.assetSymbol).toBe(ERC20_EURE_POLYGON_TOKEN_NAME);
      expect(tokenDetails?.decimals).toBe(ERC20_EURE_POLYGON_DECIMALS);
      expect(tokenDetails?.erc20AddressSourceChain).toBe(tokenAddress);
      expect(tokenDetails?.network).toBe(Networks.Polygon);
    }
  });
});
