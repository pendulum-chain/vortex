import {
  Account,
  Address,
  createPublicClient,
  createWalletClient,
  Hex,
  http,
  PublicClient,
  parseAbiItem,
  Transport,
  WalletClient
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";

/**
 * viem clients + minimal hand-written ABI surface for the B2B keeper
 * (docs/prd/monerium-b2b-implementation-plan.md §3, "Keeper").
 *
 * Key separation is an invariant (security-spec/05-integrations/monerium-b2b.md):
 * keeper key (swap submission) != guardian key (protective pause) != attestor key
 * (address linking). Reads go through the public RPC; keeper/guardian WRITES go
 * through a separate submission transport for private orderflow.
 */

/** Suggested private-orderflow endpoint for mainnet (MONERIUM_B2B_PRIVATE_RPC_URL). */
export const DEFAULT_PRIVATE_RPC_URL = "https://rpc.flashbots.net";

/**
 * Client notification confirmation depth in blocks — registry P9
 * (docs/prd/monerium-onramp-deferred-decisions.md). Not consumed by the keeper itself
 * (execution finality is handled via receipt + reorg-safe deposit identity); reserved
 * for the notification job (plan §3, "Notifications").
 */
export const NOTIFY_CONFIRMATION_DEPTH = 32;

// ------------------------------------------------------------------ ABI surface

// Hand-written minimal ABIs (no codegen) mirroring
// contracts/monerium-forwarder/src/VortexForwarder.sol + VortexForwarderFactory.sol.

export const eureTransferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

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
  { inputs: [], name: "swapAndForward", outputs: [], stateMutability: "nonpayable", type: "function" },
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
      { indexed: false, name: "eureIn", type: "uint256" },
      { indexed: false, name: "usdcOut", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
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
  { inputs: [], name: "MIN_SWAP_FLOOR", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }
] as const;

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

interface ForwarderImmutables {
  eure: Address;
  factory: Address;
}

// EURE/FACTORY are implementation-level immutables shared by every clone, so one
// lookup per forwarder address is enough for the process lifetime.
const forwarderImmutablesCache = new Map<string, ForwarderImmutables>();

export async function getForwarderImmutables(forwarderAddress: Address): Promise<ForwarderImmutables> {
  const key = forwarderAddress.toLowerCase();
  const cached = forwarderImmutablesCache.get(key);
  if (cached) {
    return cached;
  }
  const client = getPublicClient();
  const [eure, factory] = await Promise.all([
    client.readContract({ abi: forwarderAbi, address: forwarderAddress, functionName: "EURE" }),
    client.readContract({ abi: forwarderAbi, address: forwarderAddress, functionName: "FACTORY" })
  ]);
  const immutables = { eure, factory };
  forwarderImmutablesCache.set(key, immutables);
  return immutables;
}
