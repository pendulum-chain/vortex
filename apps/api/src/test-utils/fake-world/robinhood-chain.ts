import { getNetworkId, Networks, RELAY_ROBINHOOD_USDG_ADDRESS } from "@vortexfi/shared";
import { verifyTypedData } from "ethers";
import { decodeFunctionData, erc20Abi, parseTransaction } from "viem";
import {
  ROBINHOOD_STOCKS,
  ROBINHOOD_UNISWAP_FACTORY,
  ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
  ROBINHOOD_USDG_ADDRESS
} from "../../api/services/phases/blocks/core/robinhood-stocks";
import { moneriumPermitAbi } from "../../api/services/phases/blocks/phases/monerium-self-transfer/contract";
import { stockSettlementRouterAbi } from "../../api/services/phases/blocks/phases/stock-settlement/contract";
import { swapRouter02Abi } from "../../api/services/phases/blocks/phases/uniswap-v3-fixed-swap/contract";
import type { FakeEvm, RecordedEvmTx } from "./fake-evm";

type Address = `0x${string}`;

export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

/** The name in a stock token's EIP-712 domain. */
const stockName = (address: string) => {
  const symbol = Object.entries(ROBINHOOD_STOCKS).find(([, pin]) => pin.address.toLowerCase() === address.toLowerCase())?.[0];
  return symbol && `Fake ${symbol}`;
};

/**
 * Answers what a stock quote reads on Robinhood Chain: unpaused flags, a fresh Chainlink round, the pinned Uniswap
 * deployment, and QuoterV2 swapping at exactly `priceUsd` USDG per token. Other reads fall through to the handler
 * already scripted, so a test keeps its own Nabla quote.
 */
export function scriptRobinhoodChain(evm: FakeEvm, priceUsd: bigint): void {
  const scripted = evm.onReadContract;
  evm.onReadContract = (network, params) => {
    const pool = Object.values(ROBINHOOD_STOCKS).find(pin => pin.uniswapPool === params.address);
    switch (params.functionName) {
      case "paused":
      case "oraclePaused":
        return false;
      case "name":
        return stockName(params.address) ?? scripted?.(network, params);
      case "latestRoundData":
        return [1n, priceUsd * 100_000_000n, 0n, BigInt(Math.floor(Date.now() / 1000)), 1n] as const;
      case "factory":
        return ROBINHOOD_UNISWAP_FACTORY;
      case "getPool":
        return Object.values(ROBINHOOD_STOCKS).find(pin => (params.args as string[]).includes(pin.address))?.uniswapPool;
      case "fee":
        return pool?.uniswapFee;
      case "token0":
      case "token1": {
        const [token0, token1] = [ROBINHOOD_USDG_ADDRESS, pool?.address as string].sort((left, right) =>
          left.toLowerCase().localeCompare(right.toLowerCase())
        );
        return params.functionName === "token0" ? token0 : token1;
      }
      default:
        return scripted?.(network, params);
    }
  };
  evm.onSimulateContract = (_network, params) => {
    if (params.functionName === "quoteExactOutputSingle") {
      const [{ amount }] = params.args as [{ amount: bigint }];
      return [usdgCostOf(amount, priceUsd), 0n, 0, 100_000n] as const;
    }
    const [path, amountIn] = params.args as [string, bigint];
    const fromUsdg = path.slice(2, 42).toLowerCase() === RELAY_ROBINHOOD_USDG_ADDRESS.slice(2).toLowerCase();
    return [swapOutput(amountIn, fromUsdg, priceUsd), [], [], 100_000n] as const;
  };
}

const swapOutput = (amountIn: bigint, fromUsdg: boolean, priceUsd: bigint) =>
  fromUsdg ? (amountIn * 10n ** 12n) / priceUsd : (amountIn * priceUsd) / 10n ** 12n;

const usdgCostOf = (stockOut: bigint, priceUsd: bigint) => (stockOut * priceUsd + 10n ** 12n - 1n) / 10n ** 12n;

const decodeAs = <Abi extends readonly unknown[]>(abi: Abi, data: Address) => {
  try {
    return decodeFunctionData({ abi, data } as Parameters<typeof decodeFunctionData>[0]) as {
      args: readonly unknown[];
      functionName: string;
    };
  } catch {
    return null;
  }
};

/**
 * Token semantics for what a scenario broadcasts, so a wrong amount, a missing approval or an unfunded ephemeral shows
 * up the way it would on chain. A raw transaction must afford its signed fee cap and is charged all of it, at its exact
 * nonce. ERC-20 calls, permits and the pinned Uniswap router move balances and allowances, and a permit must carry the
 * owner's signature over the token's domain and current nonce, which it consumes. A call that cannot complete mines as
 * reverted. Other effects (Nabla, Relay) stay with the scenario, which uses `pull` and `credit`.
 */
export class TokenLedger {
  /** What a swap delivers against the quote it was held to. Below 10,000 the pool moved between the quote and the swap. */
  swapFillBps = 10_000n;
  private readonly allowances = new Map<string, bigint>();
  private readonly permitNonces = new Map<string, bigint>();

  /** All raw transactions in a scenario come from `rawSender`, the ramp's ephemeral. */
  constructor(
    private readonly evm: FakeEvm,
    private readonly priceUsd: bigint,
    private readonly rawSender: string
  ) {
    const scripted = evm.onReadContract;
    evm.onReadContract = (network, params) => {
      if (network === Networks.Robinhood && params.functionName === "allowance") {
        const [owner, spender] = params.args as [string, string];
        return this.allowance(network, params.address, owner, spender);
      }
      if (network === Networks.Robinhood && params.functionName === "nonces") {
        return this.permitNonces.get(this.key(params.address, params.args?.[0] as string)) ?? 0n;
      }
      return scripted?.(network, params);
    };
  }

  private key(...parts: string[]): string {
    return parts.join(":").toLowerCase();
  }

  allowance(network: string, token: string, owner: string, spender: string): bigint {
    return this.allowances.get(this.key(network, token, owner, spender)) ?? 0n;
  }

  permitNonce(token: string, owner: string): bigint {
    return this.permitNonces.get(this.key(token, owner)) ?? 0n;
  }

  private permitSigner(
    tx: RecordedEvmTx,
    token: Address,
    [owner, spender, value, deadline, v, r, s]: readonly [string, string, bigint, bigint, number, Address, Address]
  ): string | null {
    const domain = {
      chainId: getNetworkId(tx.network as Networks),
      name: stockName(token),
      verifyingContract: token,
      version: "1"
    };
    const message = { deadline, nonce: this.permitNonce(token, owner), owner, spender, value };
    try {
      return verifyTypedData(domain, PERMIT_TYPES, message, { r, s, v });
    } catch {
      return null;
    }
  }

  credit(network: string, token: string, holder: string, amount: bigint): void {
    this.evm.setErc20Balance(network, token, holder, this.evm.erc20Balance(network, token, holder) + amount);
  }

  private move(tx: RecordedEvmTx, token: string, from: string, to: string, amount: bigint): boolean {
    const balance = this.evm.erc20Balance(tx.network, token, from);
    if (balance < amount) {
      this.evm.revertedReceiptHashes.add(tx.hash);
      return false;
    }
    this.evm.setErc20Balance(tx.network, token, from, balance - amount);
    this.credit(tx.network, token, to, amount);
    return true;
  }

  /** `transferFrom` on behalf of a contract. Reverts `tx` without the allowance or balance. */
  pull(tx: RecordedEvmTx, token: string, owner: string, spender: string, to: string, amount: bigint): boolean {
    const allowance = this.allowance(tx.network, token, owner, spender);
    if (allowance < amount) {
      this.evm.revertedReceiptHashes.add(tx.hash);
      return false;
    }
    if (!this.move(tx, token, owner, to, amount)) return false;
    this.allowances.set(this.key(tx.network, token, owner, spender), allowance - amount);
    return true;
  }

  private chargeRawTransaction(tx: RecordedEvmTx): { data?: Address; to?: Address } {
    const parsed = parseTransaction(tx.serialized as Address);
    if (parsed.chainId !== getNetworkId(tx.network as Networks)) {
      throw new Error(`transaction to ${parsed.to} is signed for chain ${parsed.chainId}, not ${tx.network}`);
    }
    const cap = (parsed.gas ?? 0n) * (parsed.maxFeePerGas ?? 0n);
    const balance = this.evm.nativeBalance(tx.network, this.rawSender);
    if (balance < cap) {
      throw new Error(`insufficient funds for gas * price on ${tx.network}: have ${balance}, want ${cap} for ${parsed.to}`);
    }
    const expectedNonce = this.evm.transactionCount(tx.network, this.rawSender);
    if (parsed.nonce !== expectedNonce) {
      throw new Error(`nonce on ${tx.network} is ${expectedNonce}, transaction to ${parsed.to} has ${parsed.nonce}`);
    }
    this.evm.setTransactionCount(tx.network, this.rawSender, expectedNonce + 1);
    this.evm.setNativeBalance(tx.network, this.rawSender, balance - cap);
    return { data: parsed.data, to: parsed.to ?? undefined };
  }

  private swap(tx: RecordedEvmTx, sender: string, data: Address): void {
    const router = decodeAs(swapRouter02Abi, data);
    if (router?.functionName === "multicall") {
      const [deadline, [inner]] = router.args as [bigint, Address[]];
      const swap = decodeAs(swapRouter02Abi, inner);
      if (swap?.functionName !== "exactInput" || deadline < BigInt(Math.floor(Date.now() / 1000))) {
        this.evm.revertedReceiptHashes.add(tx.hash);
        return;
      }
      const [{ amountIn, amountOutMinimum, path, recipient }] = swap.args as [
        { amountIn: bigint; amountOutMinimum: bigint; path: Address; recipient: string }
      ];
      const tokenIn = path.slice(0, 42);
      const fromUsdg = tokenIn.toLowerCase() === ROBINHOOD_USDG_ADDRESS.toLowerCase();
      const amountOut = (swapOutput(amountIn, fromUsdg, this.priceUsd) * this.swapFillBps) / 10_000n;
      if (amountOut < amountOutMinimum) {
        this.evm.revertedReceiptHashes.add(tx.hash);
        return;
      }
      if (this.pull(tx, tokenIn, sender, ROBINHOOD_UNISWAP_SWAP_ROUTER_02, ROBINHOOD_UNISWAP_SWAP_ROUTER_02, amountIn)) {
        this.credit(tx.network, `0x${path.slice(-40)}`, recipient, amountOut);
      }
      return;
    }
    const exactOutput = decodeAs(stockSettlementRouterAbi, data);
    if (exactOutput?.functionName === "exactOutputSingle") {
      const [{ amountInMaximum, amountOut, recipient, tokenIn, tokenOut }] = exactOutput.args as [
        { amountInMaximum: bigint; amountOut: bigint; recipient: string; tokenIn: string; tokenOut: string }
      ];
      const amountIn = usdgCostOf(amountOut, this.priceUsd);
      if (amountIn > amountInMaximum) {
        this.evm.revertedReceiptHashes.add(tx.hash);
        return;
      }
      if (this.pull(tx, tokenIn, sender, ROBINHOOD_UNISWAP_SWAP_ROUTER_02, ROBINHOOD_UNISWAP_SWAP_ROUTER_02, amountIn)) {
        this.credit(tx.network, tokenOut, recipient, amountOut);
      }
    }
  }

  private tokenCall(tx: RecordedEvmTx, sender: string, token: Address, data: Address): void {
    const erc20 = decodeAs(erc20Abi, data);
    if (erc20?.functionName === "transfer") {
      const [to, amount] = erc20.args as [string, bigint];
      this.move(tx, token, sender, to, amount);
    } else if (erc20?.functionName === "approve") {
      const [spender, amount] = erc20.args as [string, bigint];
      this.allowances.set(this.key(tx.network, token, sender, spender), amount);
    } else if (erc20?.functionName === "transferFrom") {
      const [from, to, amount] = erc20.args as [string, string, bigint];
      this.pull(tx, token, from, sender, to, amount);
    } else {
      const permit = decodeAs(moneriumPermitAbi, data);
      if (permit?.functionName !== "permit") return;
      const args = permit.args as [string, string, bigint, bigint, number, Address, Address];
      const [owner, spender, value, deadline] = args;
      const signer = this.permitSigner(tx, token, args);
      if (deadline < BigInt(Math.floor(Date.now() / 1000)) || signer?.toLowerCase() !== owner.toLowerCase()) {
        this.evm.revertedReceiptHashes.add(tx.hash);
        return;
      }
      this.permitNonces.set(this.key(token, owner), this.permitNonce(token, owner) + 1n);
      this.allowances.set(this.key(tx.network, token, owner, spender), value);
    }
  }

  apply(tx: RecordedEvmTx): void {
    const sender = tx.from ?? this.rawSender;
    const { data, to } = tx.serialized
      ? this.chargeRawTransaction(tx)
      : { data: tx.data as Address | undefined, to: tx.to as Address };
    if (tx.value && to) {
      const balance = this.evm.nativeBalance(tx.network, sender);
      if (balance < tx.value)
        throw new Error(`insufficient funds on ${tx.network}: ${sender} has ${balance}, sends ${tx.value}`);
      this.evm.setNativeBalance(tx.network, sender, balance - tx.value);
      this.evm.setNativeBalance(tx.network, to, this.evm.nativeBalance(tx.network, to) + tx.value);
    }
    if (!data || data === "0x" || !to) return;
    if (to.toLowerCase() === ROBINHOOD_UNISWAP_SWAP_ROUTER_02.toLowerCase()) {
      this.swap(tx, sender, data);
    } else {
      this.tokenCall(tx, sender, to, data);
    }
  }
}
