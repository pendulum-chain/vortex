import { encodeFunctionData, erc20Abi, getAddress, isAddress, parseAbi, recoverMessageAddress, zeroAddress } from "viem";
import {
  RELAY_BASE_CHAIN_ID,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_DEPOSITORY_ADDRESS,
  RELAY_ORDER_SIGNER_ADDRESS,
  RELAY_ROBINHOOD_CHAIN_ID,
  RELAY_ROBINHOOD_USDG_ADDRESS
} from "./config";
import { computeRelayOrderId } from "./orderId";
import type { RelayQuote } from "./schemas";

const DEPOSIT_ERC20_ABI = parseAbi(["function depositErc20(address depositor, address token, uint256 amount, bytes32 id)"]);

const BASE_USDC = { chain: "base", chainId: RELAY_BASE_CHAIN_ID, token: RELAY_BASE_USDC_ADDRESS } as const;
const ROBINHOOD_USDG = { chain: "robinhood", chainId: RELAY_ROBINHOOD_CHAIN_ID, token: RELAY_ROBINHOOD_USDG_ADDRESS } as const;

type RouteEnd = typeof BASE_USDC | typeof ROBINHOOD_USDG;
type RelayStepTransaction = RelayQuote["steps"][number]["items"][number]["data"];

/** The `check` of an order that is sound but costs more than the quote committed, so a new quote can fix it. */
export const RELAY_INPUT_ABOVE_QUOTE = "inputAmountAboveQuote";

/** `check` names the failed rule. */
export class RelayValidationError extends Error {
  constructor(
    public readonly check: string,
    message: string
  ) {
    super(`Relay quote rejected (${check}): ${message}`);
    this.name = "RelayValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function assertCheck(condition: boolean, check: string, message: string): asserts condition {
  if (!condition) throw new RelayValidationError(check, message);
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Everything both deposit modes must agree on: the order is the one Relay hashed and it pays only the ephemeral. */
function assertOrder(quote: RelayQuote, origin: RouteEnd, destination: RouteEnd, ephemeral: string, minDeadlineUnix: number) {
  const { orderData: order, orderId, paymentDetails } = quote.protocol.v2;

  assertCheck(sameAddress(computeRelayOrderId(order), orderId), "orderId", "recomputed order id differs");
  assertCheck(
    quote.steps.every(step => step.requestId === quote.requestId),
    "requestId",
    "a step tracks another request"
  );

  assertCheck(
    sameAddress(paymentDetails.depository, RELAY_DEPOSITORY_ADDRESS),
    "paymentDetails.depository",
    "not the pinned depository"
  );
  assertCheck(
    paymentDetails.chainId === origin.chain && sameAddress(paymentDetails.currency, origin.token),
    "paymentDetails.currency",
    `expected ${origin.token} on ${origin.chain}`
  );
  assertCheck(BigInt(paymentDetails.amount) > 0n, "paymentDetails.amount", "amount is zero");

  assertCheck(order.inputs.length === 1, "inputs", "expected exactly one input");
  const [{ payment: input, refunds }] = order.inputs;
  assertCheck(
    input.chainId === origin.chain &&
      sameAddress(input.currency, origin.token) &&
      BigInt(input.amount) === BigInt(paymentDetails.amount),
    "inputs.payment",
    "input payment differs from the payment details"
  );
  assertCheck(
    refunds.length > 0 && refunds.every(refund => sameAddress(refund.recipient, ephemeral)),
    "refunds.recipient",
    "every refund must go to the ephemeral"
  );
  assertCheck(
    refunds[0].chainId === origin.chain && sameAddress(refunds[0].currency, origin.token),
    "refunds.origin",
    "the first refund must return the origin token on the origin chain"
  );

  const { output } = order;
  assertCheck(output.chainId === destination.chain, "output.chainId", `expected ${destination.chain}`);
  assertCheck(output.payments.length === 1, "output.payments", "expected exactly one output payment");
  const [payment] = output.payments;
  assertCheck(sameAddress(payment.recipient, ephemeral), "output.recipient", "output must pay the ephemeral");
  assertCheck(sameAddress(payment.currency, destination.token), "output.currency", `expected ${destination.token}`);
  assertCheck(output.calls.length === 0, "output.calls", "destination calls are not expected");
  assertCheck(
    output.deadline >= minDeadlineUnix,
    "output.deadline",
    `deadline ${output.deadline} is before ${minDeadlineUnix}`
  );
  assertCheck(order.fees.length === 0, "fees", "order fees are not expected");

  return { inputAmount: BigInt(paymentDetails.amount), orderId, payment };
}

function assertSteps(quote: RelayQuote, expectedIds: string[]): RelayStepTransaction[] {
  assertCheck(
    quote.steps.map(step => step.id).join() === expectedIds.join(),
    "steps",
    `expected exactly ${expectedIds.join(", ")}`
  );
  return quote.steps.map(step => {
    assertCheck(step.kind === "transaction" && step.items.length === 1, "steps", `step ${step.id} must be one transaction`);
    return step.items[0].data;
  });
}

function assertTransaction(
  name: string,
  tx: RelayStepTransaction,
  expected: { chainId: number; data: string; from: string; to: string }
) {
  assertCheck(sameAddress(tx.from, expected.from), `${name}.from`, "unexpected sender");
  assertCheck(sameAddress(tx.to, expected.to), `${name}.to`, `expected ${expected.to}`);
  assertCheck(tx.chainId === expected.chainId, `${name}.chainId`, `expected ${expected.chainId}`);
  assertCheck(BigInt(tx.value) === 0n, `${name}.value`, "value must be zero");
  // Compared whole, not decoded, so trailing bytes and any changed argument are rejected alike.
  assertCheck(tx.data.toLowerCase() === expected.data.toLowerCase(), `${name}.data`, "unexpected calldata");
}

export interface RelaySignableTransaction {
  chainId: number;
  data: `0x${string}`;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  to: `0x${string}`;
  value: string;
}

/** signUnsigned falls back to 187.5 gwei without fee fields, so a transaction without them is unusable. */
function toSignableTransaction(name: string, tx: RelayStepTransaction): RelaySignableTransaction {
  const { gas, maxFeePerGas, maxPriorityFeePerGas } = tx;
  assertCheck(gas !== undefined && BigInt(gas) > 0n, `${name}.gas`, "gas is missing");
  assertCheck(maxFeePerGas !== undefined && BigInt(maxFeePerGas) > 0n, `${name}.maxFeePerGas`, "maxFeePerGas is missing");
  assertCheck(
    maxPriorityFeePerGas !== undefined && BigInt(maxPriorityFeePerGas) <= BigInt(maxFeePerGas),
    `${name}.maxPriorityFeePerGas`,
    "maxPriorityFeePerGas is missing or above maxFeePerGas"
  );
  return {
    chainId: tx.chainId,
    data: tx.data as `0x${string}`,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    to: tx.to as `0x${string}`,
    value: tx.value
  };
}

export interface RelayCalldataDepositExpected {
  ephemeral: string;
  /** X: the USDC the quote committed to bridge. */
  maxInputAmountRaw: string;
  /** Earliest acceptable order deadline. */
  minDeadlineUnix: number;
  /** Y: the exact USDG the order must deliver. */
  outputAmountRaw: string;
}

export interface RelayCalldataDeposit {
  approveTx: RelaySignableTransaction;
  depositTx: RelaySignableTransaction;
  /** X': the USDC this order takes. */
  inputAmountRaw: string;
  orderId: string;
  requestId: string;
}

/** Base USDC to Robinhood USDG: an EXACT_OUTPUT quote deposited with `approve` then `depositErc20`. */
export function validateRelayCalldataDeposit(quote: RelayQuote, expected: RelayCalldataDepositExpected): RelayCalldataDeposit {
  const { ephemeral } = expected;
  const { inputAmount, orderId, payment } = assertOrder(quote, BASE_USDC, ROBINHOOD_USDG, ephemeral, expected.minDeadlineUnix);

  assertCheck(
    BigInt(payment.minimumAmount) === BigInt(expected.outputAmountRaw),
    "output.minimumAmount",
    `expected ${expected.outputAmountRaw}, got ${payment.minimumAmount}`
  );
  assertCheck(
    inputAmount <= BigInt(expected.maxInputAmountRaw),
    RELAY_INPUT_ABOVE_QUOTE,
    `order takes ${inputAmount}, quote committed ${expected.maxInputAmountRaw}`
  );

  const [approve, deposit] = assertSteps(quote, ["approve", "deposit"]);
  assertTransaction("approve", approve, {
    chainId: BASE_USDC.chainId,
    data: encodeFunctionData({
      abi: erc20Abi,
      args: [RELAY_DEPOSITORY_ADDRESS, inputAmount],
      functionName: "approve"
    }),
    from: ephemeral,
    to: BASE_USDC.token
  });
  assertTransaction("deposit", deposit, {
    chainId: BASE_USDC.chainId,
    data: encodeFunctionData({
      abi: DEPOSIT_ERC20_ABI,
      args: [ephemeral as `0x${string}`, BASE_USDC.token, inputAmount, orderId as `0x${string}`],
      functionName: "depositErc20"
    }),
    from: ephemeral,
    to: RELAY_DEPOSITORY_ADDRESS
  });

  return {
    approveTx: toSignableTransaction("approve", approve),
    depositTx: toSignableTransaction("deposit", deposit),
    inputAmountRaw: inputAmount.toString(),
    orderId,
    requestId: quote.requestId
  };
}

export interface RelayStrictDepositExpected {
  ephemeral: string;
  /** M: the USDG the order must be quoted for. */
  inputAmountRaw: string;
  minDeadlineUnix: number;
  /** Floor on the order's guaranteed USDC, because nothing else bounds what it pays out. */
  minOutputAmountRaw: string;
  /** Defaults to the pinned signer. Only the test fake overrides it. */
  orderSigner?: string;
  /** The swap's router, which must never double as the swap's recipient. */
  swapRouter: string;
}

export interface RelayStrictDeposit {
  depositAddress: `0x${string}`;
  expectedOutputRaw: string;
  minimumOutputRaw: string;
  orderId: string;
  requestId: string;
}

/**
 * Robinhood USDG to Base USDC through a strict one-time deposit address. These are partial checks:
 * the address itself cannot be derived offline, so nothing here proves it belongs to this order.
 */
export async function validateRelayStrictDeposit(
  quote: RelayQuote,
  expected: RelayStrictDepositExpected
): Promise<RelayStrictDeposit> {
  const { ephemeral, swapRouter } = expected;
  const { inputAmount, orderId, payment } = assertOrder(quote, ROBINHOOD_USDG, BASE_USDC, ephemeral, expected.minDeadlineUnix);

  assertCheck(
    inputAmount === BigInt(expected.inputAmountRaw),
    "paymentDetails.amount",
    `expected ${expected.inputAmountRaw}, got ${inputAmount}`
  );
  assertCheck(
    BigInt(payment.minimumAmount) >= BigInt(expected.minOutputAmountRaw),
    "output.minimumAmount",
    `${payment.minimumAmount} is below the floor ${expected.minOutputAmountRaw}`
  );

  const [deposit] = assertSteps(quote, ["deposit"]);
  const depositAddress = quote.steps[0].depositAddress ?? "";
  assertCheck(isAddress(depositAddress), "depositAddress", "not a valid EVM address");
  assertCheck(
    ![ephemeral, RELAY_DEPOSITORY_ADDRESS, swapRouter, RELAY_ROBINHOOD_USDG_ADDRESS, zeroAddress].some(forbidden =>
      sameAddress(forbidden, depositAddress)
    ),
    "depositAddress",
    `${depositAddress} cannot be a deposit address`
  );
  assertTransaction("deposit", deposit, {
    chainId: ROBINHOOD_USDG.chainId,
    data: encodeFunctionData({ abi: erc20Abi, args: [depositAddress, inputAmount], functionName: "transfer" }),
    from: ephemeral,
    to: ROBINHOOD_USDG.token
  });

  const { orderSignature } = quote.protocol.v2;
  assertCheck(orderSignature !== undefined, "orderSignature", "signature is missing");
  let signer: string;
  try {
    signer = await recoverMessageAddress({
      message: { raw: orderId as `0x${string}` },
      signature: orderSignature as `0x${string}`
    });
  } catch {
    throw new RelayValidationError("orderSignature", "signature is unreadable");
  }
  assertCheck(sameAddress(signer, expected.orderSigner ?? RELAY_ORDER_SIGNER_ADDRESS), "orderSignature", `signed by ${signer}`);

  return {
    depositAddress: getAddress(depositAddress),
    expectedOutputRaw: payment.expectedAmount,
    minimumOutputRaw: payment.minimumAmount,
    orderId,
    requestId: quote.requestId
  };
}
