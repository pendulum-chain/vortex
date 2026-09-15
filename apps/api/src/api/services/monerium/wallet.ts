import {
  EvmClientManager,
  MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
  MoneriumApiError,
  type MoneriumChain,
  Networks
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { isAddress, isHex, verifyMessage } from "viem";
import logger from "../../../config/logger";
import { APIError } from "../../errors/api-error";
import { matchingDestinations } from "../phases/blocks/phases/monerium-issue/registration";
import { MONERIUM_ISSUE_NETWORKS, type MoneriumIssueNetwork } from "../phases/blocks/phases/monerium-issue/simulation";
import { findActiveMoneriumRampForOwner } from "./active-ramp";
import { type MoneriumIdentity, type MoneriumIdentitySource, resolveMoneriumIdentity } from "./identity";

/** Chain the active EUR onramp mints on; readiness is measured against it. */
export const MONERIUM_RAMP_CHAIN = MONERIUM_ISSUE_NETWORKS[Networks.Polygon].chain;

const NETWORK_BY_CHAIN = Object.fromEntries(
  Object.entries(MONERIUM_ISSUE_NETWORKS).map(([network, { chain }]) => [chain, network])
) as Record<string, MoneriumIssueNetwork>;

export type MoneriumIbanReadiness = "provisioned" | "elsewhere" | "missing";
export type MoneriumIbanLinkOutcome = "provisioned" | "pending" | "elsewhere";

export interface MoneriumRampReadiness {
  chain: MoneriumChain;
  iban: MoneriumIbanReadiness;
  linkedAddress: string | null;
  source: MoneriumIdentitySource;
}

export interface MoneriumWalletDestination {
  address: string;
  chain: MoneriumChain;
}

export interface MoneriumWalletLinkResult extends MoneriumWalletDestination {
  iban: MoneriumIbanLinkOutcome;
}

export interface MoneriumWalletDependencies {
  findActiveRampForOwner?: typeof findActiveMoneriumRampForOwner;
  isContractAddress: (network: MoneriumIssueNetwork, address: `0x${string}`) => Promise<boolean>;
  resolveIdentity: (userId: string) => Promise<MoneriumIdentity>;
  verifyOwnership: (address: `0x${string}`, signature: `0x${string}`) => Promise<boolean>;
}

/** EOA signature over Monerium's fixed ownership message; malformed signatures count as not owned. */
export async function verifyMoneriumWalletOwnership(address: `0x${string}`, signature: `0x${string}`): Promise<boolean> {
  try {
    return await verifyMessage({ address, message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE, signature });
  } catch {
    return false;
  }
}

const defaultDependencies: MoneriumWalletDependencies = {
  isContractAddress: async (network, address) =>
    Boolean(await EvmClientManager.getInstance().getClient(network).getBytecode({ address })),
  resolveIdentity: userId => resolveMoneriumIdentity(userId),
  verifyOwnership: verifyMoneriumWalletOwnership
};

function parseDestination(input: { address?: unknown; chain?: unknown }): { address: `0x${string}`; chain: MoneriumChain } {
  if (typeof input.address !== "string" || !isAddress(input.address)) {
    throw new APIError({ message: "address must be a valid EVM address", status: httpStatus.BAD_REQUEST });
  }
  if (typeof input.chain !== "string" || !(input.chain in NETWORK_BY_CHAIN)) {
    throw new APIError({
      message: `chain must be one of: ${Object.keys(NETWORK_BY_CHAIN).join(", ")}`,
      status: httpStatus.BAD_REQUEST
    });
  }
  return { address: input.address, chain: input.chain as MoneriumChain };
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

async function readDestinations(identity: MoneriumIdentity, chain: MoneriumChain) {
  const [addresses, ibans] = await Promise.all([
    identity.client.listAddresses({ chain, profile: identity.profileId }),
    identity.client.listIbans({ profile: identity.profileId })
  ]);
  return {
    addresses: addresses.addresses.filter(entry => entry.profile === identity.profileId && entry.chains.includes(chain)),
    ibans: ibans.ibans.filter(entry => entry.profile === identity.profileId)
  };
}

/** Whether the profile can register the EUR onramp today, from the same reads registration uses. */
export async function getMoneriumRampReadiness(
  userId: string,
  dependencies: MoneriumWalletDependencies = defaultDependencies
): Promise<MoneriumRampReadiness> {
  const identity = await dependencies.resolveIdentity(userId);
  const chain = MONERIUM_RAMP_CHAIN;
  const { addresses, ibans } = await readDestinations(identity, chain);
  const matches = matchingDestinations(identity.profileId, chain, addresses, ibans);
  const linkedAddress = matches[0]?.address.address ?? addresses[0]?.address ?? null;
  const iban: MoneriumIbanReadiness = matches.length === 1 ? "provisioned" : ibans.length > 0 ? "elsewhere" : "missing";
  return { chain, iban, linkedAddress, source: identity.source };
}

/**
 * Links the user's EOA to their Monerium profile and requests the profile's single IBAN when none
 * exists. Ownership is proven by the EOA signature over Monerium's fixed message; contract wallets
 * are rejected because the onramp's self-transfer needs an ERC-2612 permit from an EOA.
 */
export async function linkMoneriumWallet(
  userId: string,
  input: { address?: unknown; chain?: unknown; signature?: unknown },
  dependencies: MoneriumWalletDependencies = defaultDependencies
): Promise<MoneriumWalletLinkResult> {
  const { address, chain } = parseDestination(input);
  if (typeof input.signature !== "string" || !isHex(input.signature)) {
    throw new APIError({ message: "signature must be hex-encoded signature bytes", status: httpStatus.BAD_REQUEST });
  }
  if (!(await dependencies.verifyOwnership(address, input.signature))) {
    throw new APIError({ message: "signature does not prove ownership of address", status: httpStatus.BAD_REQUEST });
  }
  if (await dependencies.isContractAddress(NETWORK_BY_CHAIN[chain], address)) {
    throw new APIError({
      message: "Contract wallets are not supported; the EUR onramp needs an EOA that can sign a permit",
      status: httpStatus.BAD_REQUEST
    });
  }

  const identity = await dependencies.resolveIdentity(userId);
  const before = await readDestinations(identity, chain);
  if (!before.addresses.some(entry => sameAddress(entry.address, address))) {
    await identity.client.linkAddress({
      address,
      chain,
      message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
      profile: identity.profileId,
      signature: input.signature
    });
    logger.info(`MoneriumWallet: linked ${address} on ${chain} through the ${identity.source} app`);
  }

  if (before.ibans.some(entry => entry.chain === chain && sameAddress(entry.address, address))) {
    return { address, chain, iban: "provisioned" };
  }
  if (before.ibans.length > 0) return { address, chain, iban: "elsewhere" };

  try {
    await identity.client.requestIban({ address, chain });
  } catch (error) {
    // Monerium keeps one IBAN per profile and answers 400 when one is already requested.
    if (!(error instanceof MoneriumApiError && error.status === 400)) throw error;
    logger.warn(`MoneriumWallet: POST /ibans answered 400 for ${address} on ${chain}; assuming an IBAN is already requested`);
  }
  logger.info(`MoneriumWallet: requested an IBAN for ${address} on ${chain}`);
  return { address, chain, iban: "pending" };
}

/** Moves the profile's single IBAN to an already-linked address. Only ever called on the owner's explicit request. */
export async function moveMoneriumIban(
  userId: string,
  input: { address?: unknown; chain?: unknown },
  dependencies: MoneriumWalletDependencies = defaultDependencies
): Promise<MoneriumWalletLinkResult> {
  const { address, chain } = parseDestination(input);
  const identity = await dependencies.resolveIdentity(userId);
  const { addresses, ibans } = await readDestinations(identity, chain);
  if (!addresses.some(entry => sameAddress(entry.address, address))) {
    throw new APIError({
      message: `address is not linked to the Monerium profile on ${chain}`,
      status: httpStatus.BAD_REQUEST
    });
  }
  if (ibans.length !== 1) {
    throw new APIError({ message: `Expected exactly one Monerium IBAN, found ${ibans.length}`, status: httpStatus.CONFLICT });
  }
  const current = ibans[0];
  if (current.chain !== chain || !sameAddress(current.address, address)) {
    // A live ramp waits for the mint on the IBAN's current wallet; moving it now would strand that ramp.
    const activeRampId = await (dependencies.findActiveRampForOwner ?? findActiveMoneriumRampForOwner)(current.address);
    if (activeRampId) {
      throw new APIError({
        isPublic: true,
        message: `An EUR pay-in is still in progress for the wallet the IBAN points to (${activeRampId}); wait for it to finish before moving the IBAN`,
        status: httpStatus.CONFLICT
      });
    }
    await identity.client.updateIbanDestination(current.iban, { address, chain });
    logger.info(`MoneriumWallet: moved the IBAN destination to ${address} on ${chain} through the ${identity.source} app`);
  }
  return { address, chain, iban: "provisioned" };
}
