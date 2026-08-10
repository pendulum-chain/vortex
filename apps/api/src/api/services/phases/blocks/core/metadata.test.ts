import { describe, expect, it } from "bun:test";
import { Networks } from "@vortexfi/shared";
import type { EvmDestinationGasQuote } from "./metadata";
import { getFlowMetadata } from "./metadata";

const validQuote: EvmDestinationGasQuote = {
  executionFeeUsd: "0.20",
  fundingGasLimit: "21000",
  isNativeTransfer: false,
  maximumFeePerGas: "1200000000",
  network: Networks.Arbitrum,
  programVersion: 2,
  transferGasLimit: "100000"
};

function metadata(evmDestinationGas?: unknown): unknown {
  return {
    blocks: {},
    globals: {
      ...(evmDestinationGas === undefined ? {} : { evmDestinationGas }),
      fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
      partner: null,
      request: {}
    }
  };
}

describe("getFlowMetadata EVM destination gas validation", () => {
  it("accepts absence as the legacy funding program", () => {
    expect(getFlowMetadata(metadata()).globals.evmDestinationGas).toBeUndefined();
  });

  it("accepts a complete v2 envelope including required Base L1 maxima", () => {
    const baseQuote: EvmDestinationGasQuote = {
      ...validQuote,
      maximumFundingL1FeeRaw: "12000000000000",
      maximumPayoutL1FeeRaw: "13000000000000",
      network: Networks.Base
    };

    expect(getFlowMetadata(metadata(baseQuote)).globals.evmDestinationGas).toEqual(baseQuote);
  });

  it("rejects malformed or unbounded v2 fields before they reach treasury arithmetic", () => {
    const invalidQuotes: unknown[] = [
      { ...validQuote, executionFeeUsd: "0" },
      { ...validQuote, fundingGasLimit: "1e5" },
      { ...validQuote, isNativeTransfer: "false" },
      { ...validQuote, maximumFeePerGas: (2n ** 256n).toString() },
      { ...validQuote, network: "not-a-network" },
      { ...validQuote, programVersion: 3 },
      { ...validQuote, transferGasLimit: "0" }
    ];

    for (const quote of invalidQuotes) {
      expect(() => getFlowMetadata(metadata(quote))).toThrow("EVM destination");
    }
  });

  it("requires a paired positive L1 envelope on Base-family quotes", () => {
    expect(() => getFlowMetadata(metadata({ ...validQuote, network: Networks.Base }))).toThrow("L1 fee envelope");
    expect(() =>
      getFlowMetadata(
        metadata({
          ...validQuote,
          maximumFundingL1FeeRaw: "1",
          network: Networks.Base
        })
      )
    ).toThrow("L1 fee envelope");
    expect(() =>
      getFlowMetadata(
        metadata({
          ...validQuote,
          maximumFundingL1FeeRaw: "0",
          maximumPayoutL1FeeRaw: "1",
          network: Networks.BaseSepolia
        })
      )
    ).toThrow("maximumFundingL1FeeRaw");
  });
});
