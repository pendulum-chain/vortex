import { mock } from "bun:test";
import type { RelayIntentStatus, RelayQuote, RelayQuoteRequest, RelayStrictDepositExpected } from "@vortexfi/shared";
import * as shared from "@vortexfi/shared";
import { encodeFunctionData, erc20Abi, getAddress, keccak256, parseAbi, slice, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const {
  computeRelayOrderId,
  RELAY_BASE_CHAIN_ID,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_DEPOSITORY_ADDRESS,
  RELAY_ORDER_SIGNER_ADDRESS,
  RELAY_ROBINHOOD_CHAIN_ID,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  RelayApiError,
  relayIntentStatusSchema,
  relayQuoteSchema
} = shared;

// Snapshot before any mock.module call: bun mutates the imported namespace in place,
// so restore() spreading `shared` afterwards would reinstall the fake, not the real fns.
const sharedReal = { ...shared };

const DEPOSIT_ERC20_ABI = parseAbi(["function depositErc20(address depositor, address token, uint256 amount, bytes32 id)"]);
const CHAIN_NAMES: Record<number, "base" | "robinhood"> = {
  [RELAY_BASE_CHAIN_ID]: "base",
  [RELAY_ROBINHOOD_CHAIN_ID]: "robinhood"
};
// Well-known dev key, no real funds. The real signer's key is Relay's, so the fake signs with its own.
const FAKE_ORDER_SIGNER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const SEVEN_DAYS_S = 604_800;
const HUNDRED_EIGHTY_DAYS_S = 15_552_000;

type FakeRelayFault = "malformed" | "timeout" | Error;

/**
 * Fake Relay quote and status source. The shared client functions are plain exports (not
 * singletons), so they are replaced via mock.module with the rest of the package untouched.
 * Quotes are complete orders with real ids and signatures, so the real deposit validators run
 * against them. Only the pinned order signer is swapped, for the fake's own key.
 */
export class FakeRelay {
  /** Spread Relay keeps, in bps of the input. Default mirrors the live 200-unit quotes. */
  feeBps = 6n;
  /** Live EXACT_OUTPUT orders cost about this much more input than the spread alone, whatever their size. */
  exactOutputFixedFeeRaw = 1300n;
  /** Overrides how long an order lives, in seconds. Defaults to Relay's 7 days, or 180 for a deposit address. */
  orderLifetimeSeconds?: number;
  /** Overrides the one-time deposit address of a strict order. */
  depositAddress?: string;
  /** Consumed by the next quote or status call, for fail-then-succeed scenarios. */
  nextQuoteFault: FakeRelayFault | null = null;
  nextStatusFault: FakeRelayFault | null = null;
  /** Answers to status polls, oldest first. When empty, `finalStatus` answers. */
  readonly statusScript: Array<Partial<RelayIntentStatus>> = [];
  finalStatus: Partial<RelayIntentStatus> = {
    inTxHashes: [`0x${"aa".repeat(32)}`],
    status: "success",
    txHashes: [`0x${"bb".repeat(32)}`]
  };
  /** Called with the poll's number, starting at 1, before it is answered. The fake credits nothing, so a scenario can fill here. */
  onStatusPoll?: (poll: number) => void;
  readonly quoteRequests: RelayQuoteRequest[] = [];
  readonly statusRequests: string[] = [];
  /** Quotes served so far by request id, so scenarios can look up the order they must fill. */
  readonly quotes = new Map<string, RelayQuote>();
  readonly orderSigner = FAKE_ORDER_SIGNER.address;

  async getQuote(request: RelayQuoteRequest): Promise<RelayQuote> {
    this.quoteRequests.push(request);
    const fault = this.nextQuoteFault;
    this.nextQuoteFault = null;
    if (fault === "timeout") throw timeoutError("/quote/v2", "POST");
    if (fault instanceof Error) throw fault;

    const quote = await this.buildQuote(request);
    // Parsing mirrors the real client: a malformed body fails exactly where a real one would.
    const parsed = relayQuoteSchema.parse(fault === "malformed" ? { ...quote, protocol: undefined } : quote);
    this.quotes.set(parsed.requestId, parsed);
    return parsed;
  }

  async getIntentStatus(requestId: string): Promise<RelayIntentStatus> {
    this.statusRequests.push(requestId);
    this.onStatusPoll?.(this.statusRequests.length);
    const fault = this.nextStatusFault;
    this.nextStatusFault = null;
    if (fault === "timeout") throw timeoutError("/intents/status/v3", "GET");
    if (fault instanceof Error) throw fault;
    if (fault === "malformed") return relayIntentStatusSchema.parse({ status: "not-a-status" });

    return relayIntentStatusSchema.parse(this.statusScript.shift() ?? this.finalStatus);
  }

  private async buildQuote(request: RelayQuoteRequest): Promise<RelayQuote> {
    const origin = routeEnd(request.originChainId, request.originCurrency);
    const destination = routeEnd(request.destinationChainId, request.destinationCurrency);
    const refundTo = request.refundTo ?? request.user;
    const recipient = request.recipient ?? request.user;
    if (request.strict && !request.refundTo) {
      throw new RelayApiError({
        endpoint: "/quote/v2",
        method: "POST",
        responseBody: JSON.stringify({ errorCode: "INVALID_ADDRESS", message: "refundTo is required" }),
        status: 400
      });
    }

    const amount = BigInt(request.amount);
    const isExactInput = request.tradeType === "EXACT_INPUT";
    const inputAmount = isExactInput ? amount : (amount * 10_000n) / (10_000n - this.feeBps) + 1n + this.exactOutputFixedFeeRaw;
    const outputAmount = isExactInput ? (amount * (10_000n - this.feeBps)) / 10_000n : amount;
    const slippageBps = BigInt(request.slippageTolerance ?? "200");
    const minimumAmount = isExactInput ? (outputAmount * (10_000n - slippageBps)) / 10_000n : outputAmount;

    const nonce = this.quoteRequests.length;
    const requestId = keccak256(toHex(`fake-relay-request-${nonce}`));
    const deadline =
      Math.floor(Date.now() / 1000) +
      (this.orderLifetimeSeconds ?? (request.useDepositAddress ? HUNDRED_EIGHTY_DAYS_S : SEVEN_DAYS_S));
    const depositAddress = this.depositAddress ?? fakeDepositAddress(nonce);
    const extraData = `0x${"00".repeat(12)}0729e2a4716d9f7dd17858d5d504426d228697f7`;
    const refundLeg = (end: RouteEnd) => ({
      chainId: end.chain,
      currency: end.token,
      deadline,
      extraData,
      minimumAmount: "0",
      recipient: refundTo
    });
    const orderData = {
      fees: [],
      inputs: [
        {
          payment: { amount: inputAmount.toString(), chainId: origin.chain, currency: origin.token, weight: "1" },
          refunds: [refundLeg(origin), refundLeg(destination)]
        }
      ],
      output: {
        calls: [],
        chainId: destination.chain,
        deadline,
        extraData,
        payments: [
          {
            currency: destination.token,
            expectedAmount: outputAmount.toString(),
            minimumAmount: minimumAmount.toString(),
            recipient
          }
        ]
      },
      salt: keccak256(toHex(`fake-relay-salt-${nonce}`)),
      solver: RELAY_ORDER_SIGNER_ADDRESS,
      solverChainId: "base" as const,
      version: "v1"
    };
    const orderId = computeRelayOrderId(orderData);
    const txBase = {
      chainId: origin.chainId,
      from: request.user,
      maxFeePerGas: origin.chainId === RELAY_BASE_CHAIN_ID ? "6500000" : "31500000",
      maxPriorityFeePerGas: origin.chainId === RELAY_BASE_CHAIN_ID ? "1000000" : "0",
      value: "0"
    };
    const step = (id: string, tx: { data: string; gas: string; to: string }, depositAddress?: string) => ({
      ...(depositAddress === undefined ? {} : { depositAddress }),
      id,
      items: [{ data: { ...txBase, ...tx } }],
      kind: "transaction",
      requestId
    });

    const steps = request.useDepositAddress
      ? [
          step(
            "deposit",
            {
              data: encodeFunctionData({
                abi: erc20Abi,
                args: [depositAddress as `0x${string}`, inputAmount],
                functionName: "transfer"
              }),
              gas: "86070",
              to: origin.token
            },
            depositAddress
          )
        ]
      : [
          step("approve", {
            data: encodeFunctionData({
              abi: erc20Abi,
              args: [RELAY_DEPOSITORY_ADDRESS, inputAmount],
              functionName: "approve"
            }),
            gas: "73112",
            to: origin.token
          }),
          step(
            "deposit",
            {
              data: encodeFunctionData({
                abi: DEPOSIT_ERC20_ABI,
                args: [request.user as `0x${string}`, origin.token as `0x${string}`, inputAmount, orderId],
                functionName: "depositErc20"
              }),
              gas: "75909",
              to: RELAY_DEPOSITORY_ADDRESS
            },
            ""
          )
        ];

    const usd = (raw: bigint) => (Number(raw) / 1e6).toFixed(6);
    return {
      details: {
        currencyIn: { amount: inputAmount.toString(), amountUsd: usd(inputAmount), minimumAmount: inputAmount.toString() },
        currencyOut: { amount: outputAmount.toString(), amountUsd: usd(outputAmount), minimumAmount: minimumAmount.toString() },
        totalImpact: { usd: usd(outputAmount - inputAmount) }
      },
      protocol: {
        v2: {
          orderData,
          orderId,
          orderSignature: await FAKE_ORDER_SIGNER.signMessage({ message: { raw: orderId } }),
          paymentDetails: {
            amount: inputAmount.toString(),
            chainId: origin.chain,
            currency: origin.token,
            depository: RELAY_DEPOSITORY_ADDRESS
          }
        }
      },
      requestId,
      steps
    };
  }
}

interface RouteEnd {
  chain: "base" | "robinhood";
  chainId: number;
  token: string;
}

const fakeDepositAddress = (nonce: number) => getAddress(slice(keccak256(toHex(`fake-relay-deposit-${nonce}`)), 12));

const timeoutError = (endpoint: string, method: string) =>
  new RelayApiError({ endpoint, method, responseBody: "The operation timed out.", status: 0 });

/** Relay only bridges its solver currencies here; a stock token reaching it must fail as it does live. */
function routeEnd(chainId: number, token: string): RouteEnd {
  const pinned = chainId === RELAY_BASE_CHAIN_ID ? RELAY_BASE_USDC_ADDRESS : RELAY_ROBINHOOD_USDG_ADDRESS;
  const chain = CHAIN_NAMES[chainId];
  if (!chain || token.toLowerCase() !== pinned.toLowerCase()) {
    throw new RelayApiError({
      endpoint: "/quote/v2",
      method: "POST",
      responseBody: JSON.stringify({ errorCode: "UNSUPPORTED_CURRENCY", message: `${token} on ${chainId}` }),
      status: 400
    });
  }
  return { chain, chainId, token: token.toLowerCase() };
}

export function installFakeRelay(): { fakeRelay: FakeRelay; restore: () => void } {
  const fakeRelay = new FakeRelay();

  mock.module("@vortexfi/shared", () => ({
    ...shared,
    getRelayIntentStatus: (requestId: string) => fakeRelay.getIntentStatus(requestId),
    getRelayQuote: (request: RelayQuoteRequest) => fakeRelay.getQuote(request),
    validateRelayStrictDeposit: (quote: RelayQuote, expected: RelayStrictDepositExpected) =>
      sharedReal.validateRelayStrictDeposit(quote, { ...expected, orderSigner: fakeRelay.orderSigner })
  }));

  return {
    fakeRelay,
    restore: () => {
      mock.module("@vortexfi/shared", () => sharedReal);
    }
  };
}
