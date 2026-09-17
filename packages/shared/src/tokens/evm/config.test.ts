import { describe, expect, test } from "bun:test";
import { VALID_CRYPTO_CURRENCIES } from "../../endpoints";
import { Networks } from "../../helpers";
import { MONERIUM_CHAINS, MONERIUM_TOKEN_CHAINS } from "../../services/monerium";
import { EvmToken } from "../types/evm";
import { isEvmToken } from "../utils/typeGuards";
import { evmTokenConfig } from "./config";

describe("EURe EVM token configuration", () => {
  test("keeps dormant EURe out of the public token registry", () => {
    for (const config of Object.values(evmTokenConfig)) {
      expect(config["EURE" as EvmToken]).toBeUndefined();
    }
  });

  test("distinguishes operational Monerium chains from token-only discovery chains", () => {
    expect(MONERIUM_CHAINS).toEqual([
      "ethereum",
      "gnosis",
      "polygon",
      "arbitrum",
      "linea",
      "base",
      "noble",
      "sepolia",
      "chiado",
      "amoy",
      "arbitrumsepolia",
      "lineasepolia",
      "basesepolia",
      "grand"
    ]);
    expect(MONERIUM_TOKEN_CHAINS).toEqual([...MONERIUM_CHAINS, "scrollsepolia"]);
  });

  test("keeps EURe distinct from public Circle EURC", () => {
    expect(isEvmToken("EURE")).toBe(false);
    expect(VALID_CRYPTO_CURRENCIES).not.toContain("EURE");
    expect(evmTokenConfig[Networks.Base]["EURE" as EvmToken]).toBeUndefined();
    expect(evmTokenConfig[Networks.Base][EvmToken.EURC]).toBeDefined();
  });
});
