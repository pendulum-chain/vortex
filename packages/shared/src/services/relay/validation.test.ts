import { describe, expect, test } from "bun:test";
import { encodeFunctionData, erc20Abi, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Networks } from "../../helpers/networks";
import { evmTokenConfig } from "../../tokens/evm/config";
import { EvmToken } from "../../tokens/types/evm";
import savedQuotes from "./__fixtures__/saved-quotes.json";
import { RELAY_BASE_USDC_ADDRESS, RELAY_DEPOSITORY_ADDRESS, RELAY_ROBINHOOD_USDG_ADDRESS } from "./config";
import { computeRelayOrderId } from "./orderId";
import { type RelayQuote, relayQuoteSchema } from "./schemas";
import {
  RELAY_INPUT_ABOVE_QUOTE,
  RelayValidationError,
  validateRelayCalldataDeposit,
  validateRelayStrictDeposit
} from "./validation";

const EPHEMERAL = "0x000000000000000000000000000000000000dEaD";
const ATTACKER = "0x00000000000000000000000000000000000bad00";
const LOOKALIKE_USDG = "0x0a3b763d66c0e8c7555c986a3701e1dc1bf3954f";
const SWAP_ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";
const MIN_DEADLINE = 1_790_000_000;
const DEPOSIT_ERC20_ABI = parseAbi(["function depositErc20(address depositor, address token, uint256 amount, bytes32 id)"]);

const savedQuote = (name: string): RelayQuote => {
  const quote = savedQuotes.find(candidate => candidate.name === name);
  if (!quote) throw new Error(`No saved quote ${name}`);
  return relayQuoteSchema.parse(structuredClone(quote));
};

const txOf = (quote: RelayQuote, stepIndex: number) => quote.steps[stepIndex].items[0].data;
const orderOf = (quote: RelayQuote) => quote.protocol.v2.orderData;
const paymentOf = (quote: RelayQuote) => orderOf(quote).output.payments[0];
const refundsOf = (quote: RelayQuote) => orderOf(quote).inputs[0].refunds;

/** Makes a tampered order hash-consistent, so each row reaches its own rule rather than the order id check. */
function resealOrder(quote: RelayQuote) {
  const previousId = quote.protocol.v2.orderId;
  const orderId = computeRelayOrderId(orderOf(quote));
  quote.protocol.v2.orderId = orderId;
  for (const step of quote.steps) {
    const { data } = step.items[0]?.data ?? {};
    if (data?.endsWith(previousId.slice(2))) {
      step.items[0].data.data = data.slice(0, -64) + orderId.slice(2);
    }
  }
}

function expectRejection(run: () => unknown, check: string) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RelayValidationError);
    expect((error as RelayValidationError).check).toBe(check);
    return;
  }
  throw new Error(`Expected a rejection on ${check}`);
}

describe("computeRelayOrderId", () => {
  for (const saved of savedQuotes) {
    test(`reproduces the id of the real quote ${saved.name}`, () => {
      const quote = relayQuoteSchema.parse(saved);
      expect(computeRelayOrderId(quote.protocol.v2.orderData)).toBe(quote.protocol.v2.orderId as `0x${string}`);
    });
  }

  test("any change to the order changes the id", () => {
    const quote = savedQuote("buy_eo");
    paymentOf(quote).recipient = ATTACKER;
    expect(computeRelayOrderId(orderOf(quote))).not.toBe(quote.protocol.v2.orderId as `0x${string}`);
  });
});

describe("pinned addresses", () => {
  test("match the token config", () => {
    expect(RELAY_BASE_USDC_ADDRESS.toLowerCase()).toBe(
      evmTokenConfig[Networks.Base][EvmToken.USDC]?.erc20AddressSourceChain.toLowerCase() as string
    );
    expect(RELAY_ROBINHOOD_USDG_ADDRESS.toLowerCase()).toBe(
      evmTokenConfig[Networks.Robinhood][EvmToken.USDG]?.erc20AddressSourceChain.toLowerCase() as string
    );
  });
});

describe("validateRelayCalldataDeposit", () => {
  const X_PRIME = 200122893n;
  const Y = "200000000";
  const expected = { ephemeral: EPHEMERAL, maxInputAmountRaw: X_PRIME.toString(), minDeadlineUnix: MIN_DEADLINE, outputAmountRaw: Y };

  const encodeApprove = (spender: `0x${string}`, amount: bigint) =>
    encodeFunctionData({ abi: erc20Abi, args: [spender, amount], functionName: "approve" });
  const encodeDeposit = (quote: RelayQuote, args: { depositor?: `0x${string}`; token?: `0x${string}`; amount?: bigint; id?: `0x${string}` }) =>
    encodeFunctionData({
      abi: DEPOSIT_ERC20_ABI,
      args: [
        args.depositor ?? EPHEMERAL,
        args.token ?? RELAY_BASE_USDC_ADDRESS,
        args.amount ?? X_PRIME,
        args.id ?? (quote.protocol.v2.orderId as `0x${string}`)
      ],
      functionName: "depositErc20"
    });

  test("accepts the real EXACT_OUTPUT quote and returns the transactions to sign", () => {
    const quote = savedQuote("buy_eo");
    const result = validateRelayCalldataDeposit(quote, expected);

    expect(result.inputAmountRaw).toBe(X_PRIME.toString());
    expect(result.orderId).toBe(quote.protocol.v2.orderId);
    expect(result.requestId).toBe(quote.requestId);
    expect(result.approveTx.to.toLowerCase()).toBe(RELAY_BASE_USDC_ADDRESS.toLowerCase());
    expect(result.depositTx.to).toBe(RELAY_DEPOSITORY_ADDRESS);
    for (const tx of [result.approveTx, result.depositTx]) {
      expect(tx.chainId).toBe(8453);
      expect(tx.value).toBe("0");
      expect(tx.gas).toMatch(/^[1-9]\d*$/);
      expect(tx.maxFeePerGas).toMatch(/^[1-9]\d*$/);
      expect(tx.maxPriorityFeePerGas).toMatch(/^\d+$/);
    }
  });

  test("addresses compare case-insensitively", () => {
    expect(validateRelayCalldataDeposit(savedQuote("buy_eo"), { ...expected, ephemeral: EPHEMERAL.toLowerCase() }).orderId).toBeDefined();
  });

  test("a tampered order without a matching id is rejected first", () => {
    const quote = savedQuote("buy_eo");
    paymentOf(quote).recipient = ATTACKER;
    expectRejection(() => validateRelayCalldataDeposit(quote, expected), "orderId");
  });

  test("a deposit above the quoted input is price drift, with its own check", () => {
    expectRejection(
      () => validateRelayCalldataDeposit(savedQuote("buy_eo"), { ...expected, maxInputAmountRaw: (X_PRIME - 1n).toString() }),
      RELAY_INPUT_ABOVE_QUOTE
    );
  });

  test("an order delivering less or more than Y is rejected", () => {
    for (const outputAmountRaw of ["199999999", "200000001"]) {
      expectRejection(() => validateRelayCalldataDeposit(savedQuote("buy_eo"), { ...expected, outputAmountRaw }), "output.minimumAmount");
    }
  });

  const orderRows: [string, string, (quote: RelayQuote) => void][] = [
    ["wrong depository", "paymentDetails.depository", q => { q.protocol.v2.paymentDetails.depository = ATTACKER; }],
    ["payment currency swapped", "paymentDetails.currency", q => { q.protocol.v2.paymentDetails.currency = RELAY_ROBINHOOD_USDG_ADDRESS; }],
    ["payment on another chain", "paymentDetails.currency", q => { q.protocol.v2.paymentDetails.chainId = "robinhood"; }],
    ["input amount differs from the payment", "inputs.payment", q => { orderOf(q).inputs[0].payment.amount = "1"; }],
    ["input currency differs", "inputs.payment", q => { orderOf(q).inputs[0].payment.currency = LOOKALIKE_USDG; }],
    ["two inputs", "inputs", q => { orderOf(q).inputs.push(structuredClone(orderOf(q).inputs[0])); }],
    ["origin refund to another address", "refunds.recipient", q => { refundsOf(q)[0].recipient = ATTACKER; }],
    ["destination refund to another address", "refunds.recipient", q => { refundsOf(q)[1].recipient = ATTACKER; }],
    ["no refunds", "refunds.recipient", q => { orderOf(q).inputs[0].refunds = []; }],
    ["first refund on the destination chain", "refunds.origin", q => { refundsOf(q).reverse(); }],
    ["output on the wrong chain", "output.chainId", q => { orderOf(q).output.chainId = "base"; }],
    ["second output payment", "output.payments", q => { orderOf(q).output.payments.push({ ...paymentOf(q), recipient: ATTACKER }); }],
    ["wrong recipient", "output.recipient", q => { paymentOf(q).recipient = ATTACKER; }],
    ["lookalike output token", "output.currency", q => { paymentOf(q).currency = LOOKALIKE_USDG; }],
    ["destination calls", "output.calls", q => { orderOf(q).output.calls = ["0x1234"]; }],
    ["deadline too soon", "output.deadline", q => { orderOf(q).output.deadline = MIN_DEADLINE - 1; }],
    ["order fee", "fees", q => { orderOf(q).fees = [{ amount: "1", currency: RELAY_BASE_USDC_ADDRESS, currencyChainId: "base", recipient: ATTACKER, recipientChainId: "base" }]; }]
  ];

  const stepRows: [string, string, (quote: RelayQuote) => void][] = [
    ["a step tracks another request", "requestId", q => { q.steps[1].requestId = `0x${"ab".repeat(32)}`; }],
    ["approve missing", "steps", q => { q.steps.shift(); }],
    ["deposit before approve", "steps", q => { q.steps.reverse(); }],
    ["extra step", "steps", q => { q.steps.push(structuredClone(q.steps[1])); }],
    ["two items in a step", "steps", q => { q.steps[0].items.push(structuredClone(q.steps[0].items[0])); }],
    ["empty step", "steps", q => { q.steps[1].items = []; }],
    ["signature step", "steps", q => { q.steps[0].kind = "signature"; }],
    ["approve sender", "approve.from", q => { txOf(q, 0).from = ATTACKER; }],
    ["approve on the wrong token", "approve.to", q => { txOf(q, 0).to = LOOKALIKE_USDG; }],
    ["approve on the wrong chain", "approve.chainId", q => { txOf(q, 0).chainId = 4663; }],
    ["approve with value", "approve.value", q => { txOf(q, 0).value = "1"; }],
    ["approve to the wrong spender", "approve.data", q => { txOf(q, 0).data = encodeApprove(ATTACKER, X_PRIME); }],
    ["approve for more than the deposit", "approve.data", q => { txOf(q, 0).data = encodeApprove(RELAY_DEPOSITORY_ADDRESS, X_PRIME + 1n); }],
    ["approve for less than the deposit", "approve.data", q => { txOf(q, 0).data = encodeApprove(RELAY_DEPOSITORY_ADDRESS, X_PRIME - 1n); }],
    ["approve with trailing bytes", "approve.data", q => { txOf(q, 0).data = `${txOf(q, 0).data}00`; }],
    ["approve gas missing", "approve.gas", q => { delete txOf(q, 0).gas; }],
    ["approve maxFeePerGas missing", "approve.maxFeePerGas", q => { delete txOf(q, 0).maxFeePerGas; }],
    ["approve maxPriorityFeePerGas missing", "approve.maxPriorityFeePerGas", q => { delete txOf(q, 0).maxPriorityFeePerGas; }],
    ["deposit sender", "deposit.from", q => { txOf(q, 1).from = ATTACKER; }],
    ["deposit to the wrong depository", "deposit.to", q => { txOf(q, 1).to = ATTACKER; }],
    ["deposit on the wrong chain", "deposit.chainId", q => { txOf(q, 1).chainId = 4663; }],
    ["deposit with value", "deposit.value", q => { txOf(q, 1).value = "1"; }],
    ["deposit credited to another depositor", "deposit.data", q => { txOf(q, 1).data = encodeDeposit(q, { depositor: ATTACKER }); }],
    ["deposit of the wrong token", "deposit.data", q => { txOf(q, 1).data = encodeDeposit(q, { token: LOOKALIKE_USDG }); }],
    ["deposit of another amount", "deposit.data", q => { txOf(q, 1).data = encodeDeposit(q, { amount: X_PRIME - 1n }); }],
    ["deposit for another order", "deposit.data", q => { txOf(q, 1).data = encodeDeposit(q, { id: `0x${"11".repeat(32)}` }); }],
    ["deposit with trailing bytes", "deposit.data", q => { txOf(q, 1).data = `${txOf(q, 1).data}00`; }],
    ["deposit as a plain transfer", "deposit.data", q => { txOf(q, 1).data = encodeFunctionData({ abi: erc20Abi, args: [ATTACKER, X_PRIME], functionName: "transfer" }); }],
    ["deposit gas missing", "deposit.gas", q => { delete txOf(q, 1).gas; }],
    ["deposit gas zero", "deposit.gas", q => { txOf(q, 1).gas = "0"; }],
    ["deposit maxFeePerGas missing", "deposit.maxFeePerGas", q => { delete txOf(q, 1).maxFeePerGas; }],
    ["deposit maxFeePerGas zero", "deposit.maxFeePerGas", q => { txOf(q, 1).maxFeePerGas = "0"; }],
    ["deposit maxPriorityFeePerGas missing", "deposit.maxPriorityFeePerGas", q => { delete txOf(q, 1).maxPriorityFeePerGas; }],
    ["deposit priority above max", "deposit.maxPriorityFeePerGas", q => { txOf(q, 1).maxPriorityFeePerGas = `${BigInt(txOf(q, 1).maxFeePerGas as string) + 1n}`; }]
  ];

  for (const [name, check, mutate] of [...orderRows, ...stepRows]) {
    test(`rejects: ${name}`, () => {
      const quote = savedQuote("buy_eo");
      mutate(quote);
      resealOrder(quote);
      expectRejection(() => validateRelayCalldataDeposit(quote, expected), check);
    });
  }
});

describe("validateRelayStrictDeposit", () => {
  const M = 200000000n;
  const FLOOR = "195879955";
  const DEPOSIT_ADDRESS = "0xB34aBC26cd584Fa9169168967087884c36EA8DdA";
  const testSigner = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const expected = { ephemeral: EPHEMERAL, inputAmountRaw: M.toString(), minDeadlineUnix: MIN_DEADLINE, minOutputAmountRaw: FLOOR, swapRouter: SWAP_ROUTER };
  const encodeTransfer = (to: `0x${string}`, amount: bigint) => encodeFunctionData({ abi: erc20Abi, args: [to, amount], functionName: "transfer" });

  /** Rows run with a test signer, since the pinned key cannot sign a tampered order. */
  async function validateTampered(mutate: (quote: RelayQuote) => void) {
    const quote = savedQuote("sell_strict");
    mutate(quote);
    resealOrder(quote);
    quote.protocol.v2.orderSignature = await testSigner.signMessage({ message: { raw: quote.protocol.v2.orderId as `0x${string}` } });
    return validateRelayStrictDeposit(quote, { ...expected, orderSigner: testSigner.address });
  }

  async function expectAsyncRejection(run: Promise<unknown>, check: string) {
    const error = await run.then(
      () => undefined,
      caught => caught
    );
    expect(error).toBeInstanceOf(RelayValidationError);
    expect((error as RelayValidationError).check).toBe(check);
  }

  test("accepts the real strict quote against the pinned order signer", async () => {
    const quote = savedQuote("sell_strict");
    expect(await validateRelayStrictDeposit(quote, expected)).toEqual({
      depositAddress: DEPOSIT_ADDRESS,
      expectedOutputRaw: "199877505",
      minimumOutputRaw: FLOOR,
      orderId: quote.protocol.v2.orderId,
      requestId: quote.requestId
    });
  });

  test("the tamper harness itself passes on an untouched quote", async () => {
    expect((await validateTampered(() => undefined)).depositAddress).toBe(DEPOSIT_ADDRESS);
  });

  test("a tampered order without a matching id is rejected first", async () => {
    const quote = savedQuote("sell_strict");
    paymentOf(quote).recipient = ATTACKER;
    await expectAsyncRejection(validateRelayStrictDeposit(quote, expected), "orderId");
  });

  test("rejects an order quoted for another amount than M", async () => {
    await expectAsyncRejection(validateRelayStrictDeposit(savedQuote("sell_strict"), { ...expected, inputAmountRaw: "199999999" }), "paymentDetails.amount");
  });

  test("rejects an order whose guaranteed output is below the floor", async () => {
    await expectAsyncRejection(validateRelayStrictDeposit(savedQuote("sell_strict"), { ...expected, minOutputAmountRaw: "195879956" }), "output.minimumAmount");
  });

  test("rejects a signature from anyone but the pinned signer", async () => {
    const quote = savedQuote("sell_strict");
    quote.protocol.v2.orderSignature = await testSigner.signMessage({ message: { raw: quote.protocol.v2.orderId as `0x${string}` } });
    await expectAsyncRejection(validateRelayStrictDeposit(quote, expected), "orderSignature");
  });

  test("rejects a missing or unreadable signature", async () => {
    const missing = savedQuote("sell_strict");
    delete missing.protocol.v2.orderSignature;
    await expectAsyncRejection(validateRelayStrictDeposit(missing, expected), "orderSignature");

    const unreadable = savedQuote("sell_strict");
    unreadable.protocol.v2.orderSignature = "0x1234";
    await expectAsyncRejection(validateRelayStrictDeposit(unreadable, expected), "orderSignature");
  });

  test("rejects the pinned signer's signature over another order", async () => {
    const quote = savedQuote("sell_strict");
    quote.protocol.v2.orderSignature = savedQuote("buy_ei_strict").protocol.v2.orderSignature;
    await expectAsyncRejection(validateRelayStrictDeposit(quote, expected), "orderSignature");
  });

  const rows: [string, string, (quote: RelayQuote) => void][] = [
    ["deposit address missing", "depositAddress", q => { delete q.steps[0].depositAddress; }],
    ["deposit address empty", "depositAddress", q => { q.steps[0].depositAddress = ""; }],
    ["deposit address too short", "depositAddress", q => { q.steps[0].depositAddress = "0x1234"; }],
    ["deposit address with a bad checksum", "depositAddress", q => { q.steps[0].depositAddress = DEPOSIT_ADDRESS.replace("B34a", "b34a"); }],
    ["deposit address is zero", "depositAddress", q => { q.steps[0].depositAddress = "0x0000000000000000000000000000000000000000"; }],
    ["deposit address is the ephemeral", "depositAddress", q => { q.steps[0].depositAddress = EPHEMERAL; }],
    ["deposit address is the depository", "depositAddress", q => { q.steps[0].depositAddress = RELAY_DEPOSITORY_ADDRESS; }],
    ["deposit address is the swap router", "depositAddress", q => { q.steps[0].depositAddress = SWAP_ROUTER; }],
    ["deposit address is the USDG contract", "depositAddress", q => { q.steps[0].depositAddress = RELAY_ROBINHOOD_USDG_ADDRESS; }],
    ["transfer to another address than the deposit address", "deposit.data", q => { txOf(q, 0).data = encodeTransfer(ATTACKER, M); }],
    ["transfer of another amount", "deposit.data", q => { txOf(q, 0).data = encodeTransfer(DEPOSIT_ADDRESS, M - 1n); }],
    ["approve instead of a transfer", "deposit.data", q => { txOf(q, 0).data = encodeFunctionData({ abi: erc20Abi, args: [DEPOSIT_ADDRESS, M], functionName: "approve" }); }],
    ["transfer with trailing bytes", "deposit.data", q => { txOf(q, 0).data = `${txOf(q, 0).data}00`; }],
    ["transfer of the lookalike token", "deposit.to", q => { txOf(q, 0).to = LOOKALIKE_USDG; }],
    ["transfer on the wrong chain", "deposit.chainId", q => { txOf(q, 0).chainId = 8453; }],
    ["transfer with value", "deposit.value", q => { txOf(q, 0).value = "1"; }],
    ["transfer from another sender", "deposit.from", q => { txOf(q, 0).from = ATTACKER; }],
    ["an extra step", "steps", q => { q.steps.push(structuredClone(q.steps[0])); }],
    ["an approve step instead of a transfer", "steps", q => { q.steps[0].id = "approve"; }],
    ["a step tracks another request", "requestId", q => { q.steps[0].requestId = `0x${"ab".repeat(32)}`; }],
    ["wrong depository", "paymentDetails.depository", q => { q.protocol.v2.paymentDetails.depository = ATTACKER; }],
    ["payment in the wrong token", "paymentDetails.currency", q => { q.protocol.v2.paymentDetails.currency = LOOKALIKE_USDG; }],
    ["wrong recipient", "output.recipient", q => { paymentOf(q).recipient = ATTACKER; }],
    ["output on the wrong chain", "output.chainId", q => { orderOf(q).output.chainId = "robinhood"; }],
    ["output in the wrong token", "output.currency", q => { paymentOf(q).currency = RELAY_ROBINHOOD_USDG_ADDRESS; }],
    ["second output payment", "output.payments", q => { orderOf(q).output.payments.push({ ...paymentOf(q), recipient: ATTACKER }); }],
    ["destination calls", "output.calls", q => { orderOf(q).output.calls = ["0x1234"]; }],
    ["origin refund to another address", "refunds.recipient", q => { refundsOf(q)[0].recipient = ATTACKER; }],
    ["destination refund to another address", "refunds.recipient", q => { refundsOf(q)[1].recipient = ATTACKER; }],
    ["deadline too soon", "output.deadline", q => { orderOf(q).output.deadline = MIN_DEADLINE - 1; }]
  ];

  for (const [name, check, mutate] of rows) {
    test(`rejects: ${name}`, async () => {
      await expectAsyncRejection(validateTampered(mutate), check);
    });
  }
});
