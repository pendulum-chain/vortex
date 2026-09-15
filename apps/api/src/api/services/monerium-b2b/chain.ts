import type { MoneriumChain } from "@vortexfi/shared";
import {
  Account,
  Address,
  createPublicClient,
  createWalletClient,
  Hex,
  http,
  PublicClient,
  parseAbi,
  parseAbiItem,
  Transport,
  WalletClient,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";

/**
 * viem clients + minimal hand-written ABI surface for the B2B keeper
 * (docs/architecture-monerium-b2b-onramp.md §3, "Keeper").
 *
 * Key separation is an invariant (security-spec/05-integrations/monerium-b2b.md):
 * keeper key (swap submission) != guardian key (protective pause) != attestor key
 * (address linking). Reads go through the public RPC; keeper/guardian WRITES go
 * through a separate submission transport for private orderflow.
 */

/** Suggested private-orderflow endpoint for mainnet (MONERIUM_B2B_PRIVATE_RPC_URL). */
export const DEFAULT_PRIVATE_RPC_URL = "https://rpc.flashbots.net";

const MONERIUM_CHAIN_NAMES: Record<number, MoneriumChain> = {
  1: "ethereum",
  11155111: "sepolia"
};

export function moneriumChainForChainId(chainId: number): MoneriumChain | null {
  return MONERIUM_CHAIN_NAMES[chainId] ?? null;
}

/**
 * Client notification confirmation depth in blocks — registry P9
 * (docs/adr-0005-monerium-b2b-onramp.md). Not consumed by the keeper itself
 * (execution finality is handled via receipt + reorg-safe deposit identity); reserved
 * for the notification job (plan §3, "Notifications").
 */
export const NOTIFY_CONFIRMATION_DEPTH = 32;

// ------------------------------------------------------------------ ABI surface

// Hand-written minimal ABIs (no codegen) mirroring
// contracts/monerium-forwarder/src/VortexForwarder.sol + VortexForwarderFactory.sol.

export const eureTransferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

// SwapExecuted as a standalone event item for getLogs-based crash recovery (must stay
// in sync with the entry in forwarderAbi below).
export const swapExecutedEvent = parseAbiItem(
  "event SwapExecuted(address indexed caller, uint256 routeIndex, uint256 eureIn, uint256 usdcOut, uint256 referenceRate, uint256 fee, uint256 subsidy, uint256 forwarded)"
);

export const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export const forwarderAbi = [
  { inputs: [], name: "poke", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { name: "referenceRate", type: "uint256" },
      { name: "routeIndex", type: "uint256" }
    ],
    name: "swapAndForward",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "paused", type: "bool" }],
    name: "setGuardianPaused",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  { inputs: [], name: "strandedSince", outputs: [{ name: "", type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "guardianPaused", outputs: [{ name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "EURE", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "FACTORY", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "USDC", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "ORACLE", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "ORACLE_DECIMALS", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "SLIPPAGE_BPS", outputs: [{ name: "", type: "uint16" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "MAX_FEE_PPM", outputs: [{ name: "", type: "uint32" }], stateMutability: "view", type: "function" },
  {
    inputs: [],
    name: "MAX_REFERENCE_DEVIATION_BPS",
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
    type: "function"
  },
  { inputs: [], name: "targetPpm", outputs: [{ name: "", type: "uint32" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "floorPpm", outputs: [{ name: "", type: "uint32" }], stateMutability: "view", type: "function" },
  {
    anonymous: false,
    inputs: [{ indexed: false, name: "strandedSince", type: "uint64" }],
    name: "Poked",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "caller", type: "address" },
      { indexed: false, name: "routeIndex", type: "uint256" },
      { indexed: false, name: "eureIn", type: "uint256" },
      { indexed: false, name: "usdcOut", type: "uint256" },
      { indexed: false, name: "referenceRate", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
      { indexed: false, name: "subsidy", type: "uint256" },
      { indexed: false, name: "forwarded", type: "uint256" }
    ],
    name: "SwapExecuted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, name: "paused", type: "bool" }],
    name: "GuardianPausedSet",
    type: "event"
  }
] as const;

export const factoryAbi = [
  { inputs: [], name: "minSwapAmount", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "perSwapCap", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "MIN_SWAP_FLOOR", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "subsidyVault", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "routeCount", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  {
    inputs: [{ name: "index", type: "uint256" }],
    name: "route",
    outputs: [
      { name: "path", type: "bytes" },
      { name: "enabled", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const;

// VortexSubsidyVault: the guardian-tunable limits the keeper projects a swap against.
export const subsidyVaultAbi = parseAbi([
  "function maxSubsidyPpm() view returns (uint32)",
  "function dailyBudget() view returns (uint256)",
  "function spentToday() view returns (uint256)",
  "function currentDay() view returns (uint256)",
  "function paused() view returns (bool)"
]);

export const chainlinkAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
]);

/** Uniswap V3 QuoterV2 on Ethereum mainnet (the pinned quoting contract, PRD §7.4). */
export const MAINNET_QUOTER_V2: Address = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

export const quoterV2Abi = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)"
]);

// ------------------------------------------------------------------ clients

export type KeeperWalletClient = WalletClient<Transport, undefined, Account>;

let publicClientCache: PublicClient | null = null;
let keeperClientCache: KeeperWalletClient | null = null;
let guardianClientCache: KeeperWalletClient | null = null;
let privateRpcWarned = false;

export function isKeeperChainConfigured(): boolean {
  return Boolean(config.moneriumB2b.rpcUrl && config.moneriumB2b.keeperPrivateKey);
}

/** Read/receipt client on the public RPC (MONERIUM_B2B_RPC_URL). */
export function getPublicClient(): PublicClient {
  if (!publicClientCache) {
    const { rpcUrl } = config.moneriumB2b;
    if (!rpcUrl) {
      throw new Error("MONERIUM_B2B_RPC_URL is not configured");
    }
    publicClientCache = createPublicClient({ transport: http(rpcUrl) });
  }
  return publicClientCache;
}

/**
 * Submission endpoint for keeper/guardian transactions. Prefers the dedicated private
 * orderflow RPC; falls back to the public RPC with a warning when unset (fine on
 * sandbox/testnet where DEFAULT_PRIVATE_RPC_URL, a mainnet endpoint, does not apply).
 */
function submissionRpcUrl(): string {
  const { privateRpcUrl, rpcUrl } = config.moneriumB2b;
  if (privateRpcUrl) {
    return privateRpcUrl;
  }
  if (!rpcUrl) {
    throw new Error("MONERIUM_B2B_RPC_URL is not configured");
  }
  if (!privateRpcWarned) {
    privateRpcWarned = true;
    logger.warn(
      "monerium-b2b: MONERIUM_B2B_PRIVATE_RPC_URL is not set — keeper transactions will be submitted via the public RPC " +
        `without private orderflow protection. Set it (e.g. ${DEFAULT_PRIVATE_RPC_URL}) for mainnet.`
    );
  }
  return rpcUrl;
}

/** Keeper wallet client (MONERIUM_B2B_KEEPER_PRIVATE_KEY) on the submission transport. */
export function getKeeperWalletClient(): KeeperWalletClient {
  if (!keeperClientCache) {
    const key = config.moneriumB2b.keeperPrivateKey;
    if (!key) {
      // Never include key material in errors or logs.
      throw new Error("MONERIUM_B2B_KEEPER_PRIVATE_KEY is not configured");
    }
    keeperClientCache = createWalletClient({
      account: privateKeyToAccount(key as Hex),
      transport: http(submissionRpcUrl())
    });
  }
  return keeperClientCache;
}

/**
 * Guardian wallet client (MONERIUM_B2B_GUARDIAN_PRIVATE_KEY) for the dormancy-gate
 * pause. Returns null when the key is unset — the dormancy gate then runs in log-only
 * mode. The guardian key is deliberately separate from the keeper key: it can only
 * pause (protective-only invariant, plan §2.2), never move funds.
 */
export function getGuardianWalletClient(): KeeperWalletClient | null {
  if (!config.moneriumB2b.guardianPrivateKey) {
    return null;
  }
  if (!guardianClientCache) {
    guardianClientCache = createWalletClient({
      account: privateKeyToAccount(config.moneriumB2b.guardianPrivateKey as Hex),
      transport: http(submissionRpcUrl())
    });
  }
  return guardianClientCache;
}

// ------------------------------------------------------------------ cached chain lookups

let chainIdCache: number | null = null;

export async function getChainId(): Promise<number> {
  if (chainIdCache === null) {
    chainIdCache = await getPublicClient().getChainId();
  }
  return chainIdCache;
}

export interface ForwarderImmutables {
  eure: Address;
  factory: Address;
  maxFeePpm: number;
  maxReferenceDeviationBps: number;
  oracle: Address;
  oracleDecimals: number;
  slippageBps: number;
  usdc: Address;
}

// Implementation-level immutables shared by every clone, so one lookup per forwarder
// address is enough for the process lifetime.
const forwarderImmutablesCache = new Map<string, ForwarderImmutables>();

export async function getForwarderImmutables(forwarderAddress: Address): Promise<ForwarderImmutables> {
  const key = forwarderAddress.toLowerCase();
  const cached = forwarderImmutablesCache.get(key);
  if (cached) {
    return cached;
  }
  const client = getPublicClient();
  const read = <
    T extends
      | "EURE"
      | "FACTORY"
      | "USDC"
      | "ORACLE"
      | "ORACLE_DECIMALS"
      | "SLIPPAGE_BPS"
      | "MAX_FEE_PPM"
      | "MAX_REFERENCE_DEVIATION_BPS"
  >(
    functionName: T
  ) => client.readContract({ abi: forwarderAbi, address: forwarderAddress, functionName });
  const [eure, factory, usdc, oracle, oracleDecimals, slippageBps, maxFeePpm, maxReferenceDeviationBps] = await Promise.all([
    read("EURE"),
    read("FACTORY"),
    read("USDC"),
    read("ORACLE"),
    read("ORACLE_DECIMALS"),
    read("SLIPPAGE_BPS"),
    read("MAX_FEE_PPM"),
    read("MAX_REFERENCE_DEVIATION_BPS")
  ]);
  const immutables: ForwarderImmutables = {
    eure,
    factory,
    maxFeePpm: Number(maxFeePpm),
    maxReferenceDeviationBps: Number(maxReferenceDeviationBps),
    oracle,
    oracleDecimals: Number(oracleDecimals),
    slippageBps: Number(slippageBps),
    usdc
  };
  forwarderImmutablesCache.set(key, immutables);
  return immutables;
}

// ------------------------------------------------------------------ routes + vault readers

/** Enabled swap routes on the factory whitelist, by stable index. */
export async function readEnabledRoutes(factory: Address): Promise<Array<{ index: number; path: Hex }>> {
  const client = getPublicClient();
  const count = Number(await client.readContract({ abi: factoryAbi, address: factory, functionName: "routeCount" }));
  const routes = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      client
        .readContract({ abi: factoryAbi, address: factory, args: [BigInt(index)], functionName: "route" })
        .then(([path, enabled]) => ({ enabled, index, path }))
    )
  );
  return routes.filter(route => route.enabled).map(({ index, path }) => ({ index, path }));
}

/** Static QuoterV2 quote for `amountIn` over a packed path. Mainnet only (MAINNET_QUOTER_V2 pin). */
export async function quoteRouteOutput(path: Hex, amountIn: bigint): Promise<bigint> {
  const { result } = await getPublicClient().simulateContract({
    abi: quoterV2Abi,
    address: MAINNET_QUOTER_V2,
    args: [path, amountIn],
    functionName: "quoteExactInput"
  });
  return result[0];
}

export interface SubsidyVaultState {
  balance: bigint;
  dailyBudget: bigint;
  maxSubsidyPpm: number;
  paused: boolean;
  /** Spent in the current UTC day; zero when the vault's day counter has rolled over. */
  spentToday: bigint;
}

/** Live limits and balance of the factory's subsidy vault; null when none is configured. */
export async function readSubsidyVaultState(vault: Address, usdc: Address): Promise<SubsidyVaultState | null> {
  if (vault === zeroAddress) {
    return null;
  }
  const client = getPublicClient();
  const [balance, dailyBudget, maxSubsidyPpm, paused, spentToday, currentDay] = await Promise.all([
    client.readContract({ abi: erc20Abi, address: usdc, args: [vault], functionName: "balanceOf" }),
    client.readContract({ abi: subsidyVaultAbi, address: vault, functionName: "dailyBudget" }),
    client.readContract({ abi: subsidyVaultAbi, address: vault, functionName: "maxSubsidyPpm" }),
    client.readContract({ abi: subsidyVaultAbi, address: vault, functionName: "paused" }),
    client.readContract({ abi: subsidyVaultAbi, address: vault, functionName: "spentToday" }),
    client.readContract({ abi: subsidyVaultAbi, address: vault, functionName: "currentDay" })
  ]);
  const today = BigInt(Math.floor(Date.now() / 86_400_000));
  return {
    balance,
    dailyBudget,
    maxSubsidyPpm: Number(maxSubsidyPpm),
    paused,
    spentToday: currentDay === today ? spentToday : 0n
  };
}
