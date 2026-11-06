/**
 * External API contract: Relay (docs/operations-testing.md).
 *
 * The same consumed-contract schemas and deposit validators run against the fake (hermetic,
 * PR-blocking) and against the real public API (live, nightly). Quotes are read-only and use a
 * dummy address, so nothing is signed or moved. RELAY_API_KEY is sent when set; unkeyed quotes
 * still answer today, although Relay documents the key as mandatory.
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
  type RelayQuote,
  type RelayQuoteRequest,
  relayIntentStatusSchema,
  relayQuoteSchema,
  validateRelayCalldataDeposit,
  validateRelayStrictDeposit
} from "@vortexfi/shared";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";
import { FakeRelay, installFakeRelay } from "../../test-utils/fake-world/fake-relay";

const RUN_LIVE = !!process.env.RUN_LIVE_TESTS;

const SWAP_ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";
const AMOUNT = "200000000"; // 200 units of a 6-decimal stablecoin
const SLIPPAGE_BPS = 50n;

const USER = { recipient: RELAY_PLACEHOLDER_ADDRESS, refundTo: RELAY_PLACEHOLDER_ADDRESS, user: RELAY_PLACEHOLDER_ADDRESS };
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

// The request shapes the stock route sends: buy simulate and prepare, then sell simulate and prepare.
const BUY_EXACT_INPUT: RelayQuoteRequest = {
  ...BASE_TO_ROBINHOOD,
  ...USER,
  amount: AMOUNT,
  includeProtocolData: true,
  tradeType: "EXACT_INPUT"
};
const BUY_EXACT_OUTPUT: RelayQuoteRequest = {
  ...BASE_TO_ROBINHOOD,
  ...USER,
  amount: AMOUNT,
  includeProtocolData: true,
  tradeType: "EXACT_OUTPUT"
};
const SELL_STRICT: RelayQuoteRequest = {
  ...ROBINHOOD_TO_BASE,
  ...USER,
  amount: AMOUNT,
  includeProtocolData: true,
  slippageTolerance: SLIPPAGE_BPS.toString(),
  strict: true,
  tradeType: "EXACT_INPUT",
  useDepositAddress: true
};

const minDeadline = () => Math.floor(Date.now() / 1000) + 3600;

function expectValidCalldataDeposit(quote: RelayQuote) {
  const result = validateRelayCalldataDeposit(quote, {
    ephemeral: RELAY_PLACEHOLDER_ADDRESS,
    maxInputAmountRaw: quote.protocol.v2.paymentDetails.amount,
    minDeadlineUnix: minDeadline(),
    outputAmountRaw: AMOUNT
  });
  expect(BigInt(result.inputAmountRaw)).toBeGreaterThan(BigInt(AMOUNT));
}

async function expectValidStrictDeposit(quote: RelayQuote, orderSigner?: string) {
  const result = await validateRelayStrictDeposit(quote, {
    ephemeral: RELAY_PLACEHOLDER_ADDRESS,
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
    for (const request of [BUY_EXACT_INPUT, BUY_EXACT_OUTPUT, SELL_STRICT]) {
      const quote = await fake.getQuote(request);
      expect(() => relayQuoteSchema.parse(quote)).not.toThrow();
      expect(computeRelayOrderId(quote.protocol.v2.orderData)).toBe(quote.protocol.v2.orderId as `0x${string}`);
    }
  });

  test("a fake EXACT_OUTPUT quote passes the calldata deposit validator", async () => {
    expectValidCalldataDeposit(await new FakeRelay().getQuote(BUY_EXACT_OUTPUT));
  });

  test("a fake strict quote passes the strict deposit validator with the fake's signer only", async () => {
    const fake = new FakeRelay();
    const quote = await fake.getQuote(SELL_STRICT);
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
    await expect(fake.getQuote(BUY_EXACT_OUTPUT)).rejects.toThrow();
    fake.nextQuoteFault = "timeout";
    await expect(fake.getQuote(BUY_EXACT_OUTPUT)).rejects.toThrow("status '0'");
    fake.nextQuoteFault = new Error("relay down");
    await expect(fake.getQuote(BUY_EXACT_OUTPUT)).rejects.toThrow("relay down");
    expect((await fake.getQuote(BUY_EXACT_OUTPUT)).requestId).toBeDefined();

    fake.nextStatusFault = "malformed";
    await expect(fake.getIntentStatus("0x01")).rejects.toThrow();
    fake.nextStatusFault = "timeout";
    await expect(fake.getIntentStatus("0x01")).rejects.toThrow("status '0'");
    expect((await fake.getIntentStatus("0x01")).status).toBe("success");
  });

  test("like the live API, it refuses a stock token and a strict quote without refundTo", async () => {
    const fake = new FakeRelay();
    await expect(
      fake.getQuote({ ...BUY_EXACT_INPUT, destinationCurrency: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C" })
    ).rejects.toThrow("UNSUPPORTED_CURRENCY");
    await expect(fake.getQuote({ ...SELL_STRICT, refundTo: undefined })).rejects.toThrow("INVALID_ADDRESS");
  });

  test("installs over the shared exports, keeps the real validator running, and restores", async () => {
    const { fakeRelay, restore } = installFakeRelay();
    try {
      const quote = await getRelayQuote(SELL_STRICT);
      expect(fakeRelay.quoteRequests).toEqual([SELL_STRICT]);
      await expectValidStrictDeposit(quote);
      await expect(
        validateRelayStrictDeposit(quote, {
          ephemeral: RELAY_PLACEHOLDER_ADDRESS,
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

  test("every quote gets its own request id and deposit address", async () => {
    const fake = new FakeRelay();
    const first = await fake.getQuote(SELL_STRICT);
    const second = await fake.getQuote(SELL_STRICT);
    expect(first.requestId).not.toBe(second.requestId);
    expect(first.steps[0].depositAddress).not.toBe(second.steps[0].depositAddress);
    expect(fake.quotes.get(first.requestId)).toEqual(first);
  });
});

describe.skipIf(!RUN_LIVE)("Relay external API contract — live", () => {
  test(
    "EXACT_INPUT quote satisfies the consumed quote contract and its order id reproduces",
    async () => {
      const quote = await runLive("relay EXACT_INPUT quote", () => getRelayQuote(BUY_EXACT_INPUT));
      if (!quote) return;
      expect(computeRelayOrderId(quote.protocol.v2.orderData)).toBe(quote.protocol.v2.orderId as `0x${string}`);
    },
    60_000
  );

  test(
    "EXACT_OUTPUT calldata quote passes the deposit validator, pinned depository and tokens included",
    async () => {
      const quote = await runLive("relay EXACT_OUTPUT quote", () => getRelayQuote(BUY_EXACT_OUTPUT));
      if (!quote) return;
      expectValidCalldataDeposit(quote);
    },
    60_000
  );

  test(
    "strict quote passes the deposit validator, pinned order signer included",
    async () => {
      const quote = await runLive("relay strict quote", () => getRelayQuote(SELL_STRICT));
      if (!quote) return;
      await expectValidStrictDeposit(quote);
    },
    60_000
  );

  test(
    "status of a just-quoted and of an unknown request satisfy the consumed status contract",
    async () => {
      const quote = await runLive("relay EXACT_INPUT quote", () => getRelayQuote(BUY_EXACT_INPUT));
      if (!quote) return;
      const quoted = await runLive("relay status", () => getRelayIntentStatus(quote.requestId));
      if (quoted) expect(quoted.status).toBe("waiting");
      const unknown = await runLive("relay unknown status", () => getRelayIntentStatus(`0x${"00".repeat(32)}`));
      if (unknown) expect(unknown.status).toBe("unknown");
    },
    60_000
  );
});

test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
