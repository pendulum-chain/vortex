import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EvmNetworks, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi } from "viem";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import * as partnerPricingNamespace from "../../../partners/partner-pricing.service";

const sharedReal = { ...sharedNamespace };
const partnerPricingReal = { ...partnerPricingNamespace };

const VORTEX_PAYOUT = "0x000000000000000000000000000000000000fee5";
const PARTNER_PAYOUT = "0x000000000000000000000000000000000000abcd";
const PARTNER_ID = "11111111-1111-1111-1111-111111111111";

let partnerPayoutAddressEvm: string | null = PARTNER_PAYOUT;

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        estimateFeesPerGas: async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 1000000n })
      })
    })
  }
}));

mock.module("../../../partners/partner-pricing.service", () => ({
  findPartnerWithPricing: async (where: { name?: string; id?: string }) => {
    if (where.name === "vortex") {
      return { payoutAddressEvm: VORTEX_PAYOUT };
    }
    if (where.id === PARTNER_ID) {
      return { payoutAddressEvm: partnerPayoutAddressEvm };
    }
    return null;
  }
}));

const { computeFeeComponentRaws, computeEvmFeeTransfers, createEvmFeeDistributionTransactions } = await import(
  "../core/fee-distribution"
);
const { prepareDistributeFeesTxs } = await import("../phases/distribute-fees/transactions");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../partners/partner-pricing.service", () => ({ ...partnerPricingReal }));
});

beforeEach(() => {
  partnerPayoutAddressEvm = PARTNER_PAYOUT;
});

function buildQuote(usd: { network: string; vortex: string; partnerMarkup: string }, pricingPartnerId?: string) {
  return {
    id: "quote-1",
    inputCurrency: EvmToken.USDC,
    metadata: { fees: { usd: { anchor: "0", total: "0", ...usd } } },
    outputCurrency: FiatToken.BRL,
    partnerId: null,
    pricingPartnerId: pricingPartnerId ?? null,
    rampType: RampDirection.SELL
  } as unknown as QuoteTicketAttributes;
}

describe("computeFeeComponentRaws", () => {
  it("buckets network+vortex together and partner markup separately", () => {
    const raws = computeFeeComponentRaws(buildQuote({ network: "0.1", partnerMarkup: "0.5", vortex: "0.25" }), 6);
    expect(raws).toEqual({ partnerMarkupRaw: "500000", totalRaw: "850000", vortexTotalRaw: "350000" });
  });

  it("returns null without a USD fee structure", () => {
    const quote = { metadata: {} } as unknown as QuoteTicketAttributes;
    expect(computeFeeComponentRaws(quote, 6)).toBeNull();
  });
});

describe("computeEvmFeeTransfers", () => {
  it("builds one transfer per recipient for a split distribution", async () => {
    const transfers = await computeEvmFeeTransfers(buildQuote({ network: "0", partnerMarkup: "1", vortex: "1" }, PARTNER_ID), 6);
    expect(transfers).toEqual([
      { amountRaw: "1000000", toAddress: VORTEX_PAYOUT },
      { amountRaw: "1000000", toAddress: PARTNER_PAYOUT }
    ]);
  });

  it("builds only the vortex transfer when there is no partner markup", async () => {
    const transfers = await computeEvmFeeTransfers(buildQuote({ network: "0.5", partnerMarkup: "0", vortex: "1" }), 6);
    expect(transfers).toEqual([{ amountRaw: "1500000", toAddress: VORTEX_PAYOUT }]);
  });

  it("returns no transfers for a zero-fee quote without resolving payout addresses", async () => {
    const transfers = await computeEvmFeeTransfers(buildQuote({ network: "0", partnerMarkup: "0", vortex: "0" }), 6);
    expect(transfers).toEqual([]);
  });

  it("fails closed when a positive markup has no partner payout address", async () => {
    partnerPayoutAddressEvm = null;
    await expect(computeEvmFeeTransfers(buildQuote({ network: "0", partnerMarkup: "1", vortex: "1" }, PARTNER_ID), 6)).rejects.toThrow(
      /strand charged fees/
    );
  });

  it("does not require a partner payout address when the markup rounds to zero raw units", async () => {
    partnerPayoutAddressEvm = null;
    const transfers = await computeEvmFeeTransfers(
      buildQuote({ network: "0", partnerMarkup: "0.0000004", vortex: "1" }, PARTNER_ID),
      6
    );
    expect(transfers).toEqual([{ amountRaw: "1000000", toAddress: VORTEX_PAYOUT }]);
  });
});

describe("createEvmFeeDistributionTransactions", () => {
  it("emits plain sequential ERC-20 transfers with unbuffered gas estimates", async () => {
    const usdt = sharedReal.evmTokenConfig[Networks.Polygon][EvmToken.USDT];
    if (!usdt) throw new Error("Polygon USDT config missing");
    const txs = await createEvmFeeDistributionTransactions(
      buildQuote({ network: "0", partnerMarkup: "2", vortex: "1" }, PARTNER_ID),
      Networks.Polygon as EvmNetworks,
      usdt
    );
    expect(txs).toHaveLength(2);
    for (const tx of txs) {
      expect(tx.to).toBe(usdt.erc20AddressSourceChain);
      expect(tx.gas).toBe("100000");
      // Unbuffered: the SDK applies its own multiplier at signing time.
      expect(tx.maxFeePerGas).toBe("1000000000");
      expect(tx.value).toBe("0");
    }
    const decoded = txs.map(tx => {
      const { args } = decodeFunctionData({ abi: erc20Abi, data: tx.data as `0x${string}` });
      const [recipient, amount] = args as readonly [string, bigint];
      return { amount, recipient: recipient.toLowerCase() };
    });
    expect(decoded).toEqual([
      { amount: 1000000n, recipient: VORTEX_PAYOUT },
      { amount: 2000000n, recipient: PARTNER_PAYOUT }
    ]);
  });
});

describe("prepareDistributeFeesTxs", () => {
  const MISSING_TOKEN = "definitely-missing" as EvmToken;

  function buildPrepareCtx(totalFeesUsd: string) {
    return {
      accounts: {
        EVM: { address: "0x3434343434343434343434343434343434343434", network: Networks.Polygon, type: "EVM" }
      },
      globals: {
        fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: totalFeesUsd, vortex: totalFeesUsd } },
        partner: { id: null },
        request: {}
      },
      ownMetadata: { totalFeesUsd },
      quote: { id: "quote-1", partnerId: null, pricingPartnerId: null, rampType: RampDirection.SELL }
    } as never;
  }

  it("fails registration when the fee token configuration is missing for a fee-charging quote", async () => {
    await expect(
      prepareDistributeFeesTxs(buildPrepareCtx("1"), Networks.Polygon as EvmNetworks, MISSING_TOKEN)
    ).rejects.toThrow(/refusing to register a fee-charging quote/);
  });

  it("returns no intents for a zero-fee quote even with missing token configuration", async () => {
    const prepared = await prepareDistributeFeesTxs(buildPrepareCtx("0"), Networks.Polygon as EvmNetworks, MISSING_TOKEN);
    expect(prepared.intents).toEqual([]);
  });
});
