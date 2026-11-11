/**
 * External API contract: Relay (docs/operations-testing.md).
 *
 * The same consumed-contract schemas and deposit validators run against the fake (hermetic,
 * PR-blocking) and against the real public API (live, nightly). The live half sends the exact
 * requests the stock route sends, which a hermetic test pins against the production code. Orders
 * name a fresh, unfunded address, so nothing is signed or moved. RELAY_API_KEY is sent when set;
 * unkeyed quotes still answer today, although Relay documents the key as mandatory. Relay is a
 * production API, so a 4xx other than 401, 403 or 429 fails the suite instead of being inconclusive.
 *
 * Status of a real fill has no live check: it needs a real deposit. Its consumed surface is
 * checked for the just-quoted and unknown-id answers.
 */
import { describe, expect, test } from "bun:test";
import {
  computeRelayOrderId,
  getRelayIntentStatus,
  getRelayQuote,
  RELAY_BASE_CHAIN_ID,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_PLACEHOLDER_ADDRESS,
  RELAY_ROBINHOOD_CHAIN_ID,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  RelayApiError,
  type RelayQuote,
  type RelayQuoteRequest,
  relayIntentStatusSchema,
  relayQuoteSchema,
  validateRelayCalldataDeposit,
  validateRelayStrictDeposit
} from "@vortexfi/shared";
import Big from "big.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { StockSymbol } from "../../api/services/phases/blocks/core/robinhood-stocks";
import type { PhaseCtx } from "../../api/services/phases/blocks/core/types";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";
import { FakeRelay, installFakeRelay } from "../../test-utils/fake-world/fake-relay";

const RUN_LIVE = !!process.env.RUN_LIVE_TESTS;

const SWAP_ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";
const AMOUNT = "200000000"; // 200 units of a 6-decimal stablecoin
// A fresh address per run, as each registration orders for a new, unfunded ephemeral.
const EPHEMERAL = privateKeyToAccount(generatePrivateKey()).address;
const ORDER_PARTIES = { recipient: EPHEMERAL, refundTo: EPHEMERAL, user: EPHEMERAL };
const BASE_TO_ROBINHOOD = {
  destinationChainId: RELAY_ROBINHOOD_CHAIN_ID,
  destinationCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
  originChainId: RELAY_BASE_CHAIN_ID,
  originCurrency: RELAY_BASE_USDC_ADDRESS
};
const ROBINHOOD_TO_BASE = {
  destinationChainId: RELAY_BASE_CHAIN_ID,
  destinationCurrency: RELAY_BASE_USDC_ADDRESS,
  originChainId: RELAY_ROBINHOOD_CHAIN_ID,
  originCurrency: RELAY_ROBINHOOD_USDG_ADDRESS
};

// The requests the stock route sends: the buy's quote and order, then the sell's quote and order.
const BUY_QUOTE: RelayQuoteRequest = {
  ...BASE_TO_ROBINHOOD,
  amount: AMOUNT,
  tradeType: "EXACT_INPUT",
  user: RELAY_PLACEHOLDER_ADDRESS
};
const BUY_ORDER: RelayQuoteRequest = {
  ...BASE_TO_ROBINHOOD,
  ...ORDER_PARTIES,
  amount: AMOUNT,
  includeProtocolData: true,
  tradeType: "EXACT_OUTPUT"
};
const STRICT = { slippageTolerance: "50", strict: true, tradeType: "EXACT_INPUT", useDepositAddress: true } as const;
const SELL_QUOTE: RelayQuoteRequest = {
  ...ROBINHOOD_TO_BASE,
  ...STRICT,
  amount: AMOUNT,
  refundTo: RELAY_PLACEHOLDER_ADDRESS,
  user: RELAY_PLACEHOLDER_ADDRESS
};
const SELL_ORDER: RelayQuoteRequest = { ...ROBINHOOD_TO_BASE, ...STRICT, ...ORDER_PARTIES, amount: AMOUNT, includeProtocolData: true };

/** Like `runLive`, except that Relay refusing a request for any reason but auth or rate limit fails the test. */
const runRelayLive = <T>(label: string, call: () => Promise<T>) =>
  runLive(label, () =>
    call().catch(error => {
      if (error instanceof RelayApiError && error.status >= 400 && error.status < 500 && ![401, 403, 429].includes(error.status)) {
        throw Object.assign(error, { providerContractViolation: true });
      }
      throw error;
    })
  );

const minDeadline = () => Math.floor(Date.now() / 1000) + 3600;

function expectValidCalldataDeposit(quote: RelayQuote) {
  const result = validateRelayCalldataDeposit(quote, {
    ephemeral: EPHEMERAL,
    maxInputAmountRaw: quote.protocol.v2.paymentDetails.amount,
    minDeadlineUnix: minDeadline(),
    outputAmountRaw: AMOUNT
  });
  expect(BigInt(result.inputAmountRaw)).toBeGreaterThan(BigInt(AMOUNT));
}

async function expectValidStrictDeposit(quote: RelayQuote, orderSigner?: string) {
  const result = await validateRelayStrictDeposit(quote, {
    ephemeral: EPHEMERAL,
    inputAmountRaw: AMOUNT,
    minDeadlineUnix: minDeadline(),
    minOutputAmountRaw: ((BigInt(AMOUNT) * 9_800n) / 10_000n).toString(),
    orderSigner,
    swapRouter: SWAP_ROUTER
  });
  expect(result.requestId).toBe(quote.requestId);
}

describe("Relay external API contract — hermetic (fake)", () => {
  test("fake quotes satisfy the consumed quote contract and carry a real order id", async () => {
    const fake = new FakeRelay();
    for (const request of [BUY_QUOTE, BUY_ORDER, SELL_QUOTE, SELL_ORDER]) {
      const quote = await fake.getQuote(request);
      expect(() => relayQuoteSchema.parse(quote)).not.toThrow();
      expect(computeRelayOrderId(quote.protocol.v2.orderData)).toBe(quote.protocol.v2.orderId as `0x${string}`);
    }
  });

  test("a fake EXACT_OUTPUT quote passes the calldata deposit validator", async () => {
    expectValidCalldataDeposit(await new FakeRelay().getQuote(BUY_ORDER));
  });

  test("a fake strict quote passes the strict deposit validator with the fake's signer only", async () => {
    const fake = new FakeRelay();
    const quote = await fake.getQuote(SELL_ORDER);
    await expectValidStrictDeposit(quote, fake.orderSigner);
    await expect(expectValidStrictDeposit(quote)).rejects.toThrow("orderSignature");
  });

  test("fake statuses satisfy the consumed status contract", async () => {
    const fake = new FakeRelay();
    fake.statusScript.push({ status: "waiting" }, { failReason: "N/A", refundFailReason: "N/A", status: "failure" });

    expect(relayIntentStatusSchema.parse(await fake.getIntentStatus("0x01")).status).toBe("waiting");
    expect(relayIntentStatusSchema.parse(await fake.getIntentStatus("0x01"))).toEqual({
      failReason: undefined,
      inTxHashes: [],
      refundFailReason: undefined,
      status: "failure",
      txHashes: []
    });
    expect(relayIntentStatusSchema.parse(await fake.getIntentStatus("0x01")).status).toBe("success");
    expect(fake.statusRequests).toEqual(["0x01", "0x01", "0x01"]);
  });

  test("standard behaviours: malformed, timeout and fail-then-succeed", async () => {
    const fake = new FakeRelay();

    fake.nextQuoteFault = "malformed";
    await expect(fake.getQuote(BUY_ORDER)).rejects.toThrow();
    fake.nextQuoteFault = "timeout";
    await expect(fake.getQuote(BUY_ORDER)).rejects.toThrow("status '0'");
    fake.nextQuoteFault = new Error("relay down");
    await expect(fake.getQuote(BUY_ORDER)).rejects.toThrow("relay down");
    expect((await fake.getQuote(BUY_ORDER)).requestId).toBeDefined();

    fake.nextStatusFault = "malformed";
    await expect(fake.getIntentStatus("0x01")).rejects.toThrow();
    fake.nextStatusFault = "timeout";
    await expect(fake.getIntentStatus("0x01")).rejects.toThrow("status '0'");
    expect((await fake.getIntentStatus("0x01")).status).toBe("success");
  });

  test("like the live API, it refuses a stock token and a strict quote without refundTo", async () => {
    const fake = new FakeRelay();
    await expect(
      fake.getQuote({ ...BUY_QUOTE, destinationCurrency: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C" })
    ).rejects.toThrow("UNSUPPORTED_CURRENCY");
    await expect(fake.getQuote({ ...SELL_ORDER, refundTo: undefined })).rejects.toThrow("INVALID_ADDRESS");
  });

  test("installs over the shared exports, keeps the real validator running, and restores", async () => {
    const { fakeRelay, restore } = installFakeRelay();
    try {
      const quote = await getRelayQuote(SELL_ORDER);
      expect(fakeRelay.quoteRequests).toEqual([SELL_ORDER]);
      await expectValidStrictDeposit(quote);
      await expect(
        validateRelayStrictDeposit(quote, {
          ephemeral: EPHEMERAL,
          inputAmountRaw: "1",
          minDeadlineUnix: minDeadline(),
          minOutputAmountRaw: "0",
          swapRouter: SWAP_ROUTER
        })
      ).rejects.toThrow("paymentDetails.amount");
    } finally {
      restore();
    }
    expect(String(getRelayQuote)).not.toContain("fakeRelay");
  });

  // Importing the stock route needs the hermetic environment, so this runs only outside the live suite.
  test.skipIf(RUN_LIVE)("the live requests are the ones the stock route sends", async () => {
    const { fakeRelay, restore } = installFakeRelay();
    try {
      const { simulateStockRouteBuy, simulateStockRouteSell } = await import(
        "../../api/services/phases/blocks/phases/stock-route/simulation"
      );
      const { prepareStockRouteBuyTxs, prepareStockRouteSellTxs } = await import(
        "../../api/services/phases/blocks/phases/stock-route/transactions"
      );
      const ctx = { addNote() {}, now: new Date() } as unknown as PhaseCtx;
      const atPrice = (usdPerStock: bigint) => ({
        readReference: async () => ({ priceUsd: new Big(usdPerStock.toString()), updatedAt: new Date() }),
        verifyDeployment: async () => {}
      });
      const prepareCtx = (ownMetadata: unknown) =>
        ({ accounts: { EVM: { address: EPHEMERAL, type: "EVM" } }, ownMetadata }) as never;
      const transactionDependencies = { probeFees: async () => ({ maxFeePerGas: 30_000_000n, maxPriorityFeePerGas: 0n }) };

      const buy = await simulateStockRouteBuy(
        "NVDA" as StockSymbol,
        { amount: new Big(200), amountRaw: AMOUNT, chain: "base", token: "USDC" } as never,
        ctx,
        { ...atPrice(181n), quoteSwap: async (_path, usdg) => (usdg * 10n ** 12n) / 181n }
      );
      await prepareStockRouteBuyTxs(prepareCtx(buy.metadata), transactionDependencies);
      const sell = await simulateStockRouteSell(
        "NVDA" as StockSymbol,
        { amount: new Big(1), amountRaw: (10n ** 18n).toString(), chain: "robinhood", token: "NVDA" } as never,
        ctx,
        { ...atPrice(181n), quoteSwap: async (_path, stock) => (stock * 181n) / 10n ** 12n }
      );
      await prepareStockRouteSellTxs(prepareCtx(sell.metadata), transactionDependencies);

      expect(fakeRelay.quoteRequests.map(request => ({ ...request, amount: AMOUNT }))).toEqual([
        BUY_QUOTE,
        BUY_ORDER,
        SELL_QUOTE,
        SELL_ORDER
      ]);
    } finally {
      restore();
    }
  });

  test("a refused request fails the live suite, unless it is auth or rate limit", async () => {
    const refused = (status: number) => () =>
      Promise.reject(new RelayApiError({ endpoint: "/quote/v2", method: "POST", responseBody: "{}", status }));
    await expect(runRelayLive("refused", refused(400))).rejects.toThrow("status '400'");
    for (const status of [0, 401, 403, 429, 500]) {
      expect(await runRelayLive("unavailable", refused(status))).toBeNull();
    }
  });

  test("every quote gets its own request id and deposit address", async () => {
    const fake = new FakeRelay();
    const first = await fake.getQuote(SELL_ORDER);
    const second = await fake.getQuote(SELL_ORDER);
    expect(first.requestId).not.toBe(second.requestId);
    expect(first.steps[0].depositAddress).not.toBe(second.steps[0].depositAddress);
    expect(fake.quotes.get(first.requestId)).toEqual(first);
  });
});

describe.skipIf(!RUN_LIVE)("Relay external API contract — live", () => {
  test(
    "buy quote satisfies the consumed quote contract and its order id reproduces",
    async () => {
      const quote = await runRelayLive("relay buy quote", () => getRelayQuote(BUY_QUOTE));
      if (!quote) return;
      expect(computeRelayOrderId(quote.protocol.v2.orderData)).toBe(quote.protocol.v2.orderId as `0x${string}`);
    },
    60_000
  );

  test(
    "buy order passes the calldata deposit validator, pinned depository and tokens included",
    async () => {
      const quote = await runRelayLive("relay buy order", () => getRelayQuote(BUY_ORDER));
      if (!quote) return;
      expectValidCalldataDeposit(quote);
    },
    60_000
  );

  test(
    "sell quote satisfies the consumed quote contract",
    async () => {
      await runRelayLive("relay sell quote", () => getRelayQuote(SELL_QUOTE));
    },
    60_000
  );

  test(
    "sell order passes the strict deposit validator, pinned order signer included",
    async () => {
      const quote = await runRelayLive("relay sell order", () => getRelayQuote(SELL_ORDER));
      if (!quote) return;
      await expectValidStrictDeposit(quote);
    },
    60_000
  );

  test(
    "status of a just-quoted and of an unknown request satisfy the consumed status contract",
    async () => {
      const quote = await runRelayLive("relay buy quote", () => getRelayQuote(BUY_QUOTE));
      if (!quote) return;
      const quoted = await runRelayLive("relay status", () => getRelayIntentStatus(quote.requestId));
      if (quoted) expect(quoted.status).toBe("waiting");
      const unknown = await runRelayLive("relay unknown status", () => getRelayIntentStatus(`0x${"00".repeat(32)}`));
      if (unknown) expect(unknown.status).toBe("unknown");
    },
    60_000
  );
});

test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
