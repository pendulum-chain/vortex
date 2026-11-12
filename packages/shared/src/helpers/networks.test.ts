import { describe, expect, it } from "bun:test";
import {
  doesNetworkSupportEurOnramp,
  doesNetworkSupportRamp,
  getNetworkDisplayName,
  getNetworkId,
  isNetworkEVM,
  Networks,
  robinhoodChain
} from "./networks";

describe("Robinhood Chain network", () => {
  it("is an EVM network with chain id 4663, hidden from the generic ramp UIs", () => {
    expect(isNetworkEVM(Networks.Robinhood)).toBe(true);
    expect(getNetworkId(Networks.Robinhood)).toBe(4663);
    expect(getNetworkDisplayName(Networks.Robinhood)).toBe("Robinhood Chain");
    expect(doesNetworkSupportRamp(Networks.Robinhood)).toBe(false);
  });

  it("does not take EUR onramps, while other EVM networks still do", () => {
    expect(doesNetworkSupportEurOnramp(Networks.Robinhood)).toBe(false);
    expect(doesNetworkSupportEurOnramp(Networks.Arbitrum)).toBe(true);
  });

  it("defines the chain with native ETH, its public RPC, explorer and multicall3", () => {
    expect(robinhoodChain.nativeCurrency).toEqual({ decimals: 18, name: "Ether", symbol: "ETH" });
    expect(robinhoodChain.rpcUrls.default.http).toEqual(["https://rpc.mainnet.chain.robinhood.com"]);
    expect(robinhoodChain.blockExplorers.default.url).toBe("https://robinhoodchain.blockscout.com");
    expect(robinhoodChain.contracts.multicall3.address).toBe("0xcA11bde05977b3631167028862bE2a173976CA11");
  });
});
