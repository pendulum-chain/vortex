import {
  MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
  type MoneriumAddress,
  MoneriumApiService,
  type MoneriumChain,
  type MoneriumIban
} from "@vortexfi/shared";

/**
 * Narrow view of the shared Monerium white-label client (`@vortexfi/shared`
 * `MoneriumApiService`) — the single Monerium transport in the repo. Only the
 * operations the B2B onramp needs; auth, timeouts, wire-schema validation, and
 * response redaction live in the shared client
 * (docs/security-spec/05-integrations/monerium.md).
 */

/** The shared client reads these directly; callers gate on this before touching it. */
export function isWhitelabelConfigured(): boolean {
  return Boolean(process.env.MONERIUM_WHITELABEL_CLIENT_ID && process.env.MONERIUM_WHITELABEL_CLIENT_SECRET);
}

/**
 * POST /addresses — links a forwarder address to a profile using the attestor's
 * EIP-1271-verifiable signature over the fixed link message (see ./attestor.ts).
 * The signature bytes pass through unchanged (shared-client invariant 8).
 */
export async function linkAddress(
  profileId: string,
  address: string,
  chain: MoneriumChain,
  signature: string
): Promise<unknown> {
  return MoneriumApiService.getInstance().linkAddress({
    address,
    chain,
    message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
    profile: profileId,
    signature
  });
}

/** POST /ibans — requests IBAN issuance for a linked address (202 provisioning, 304 already issued). */
export async function requestIban(address: string, chain: MoneriumChain): Promise<unknown> {
  return MoneriumApiService.getInstance().requestIban({ address, chain });
}

/** GET /ibans — all IBANs visible to the partner context (association monitor + lookups). */
export async function listIbans(): Promise<MoneriumIban[]> {
  return (await MoneriumApiService.getInstance().listIbans()).ibans;
}

/** Exact account-scoped IBAN match; never guesses across chain/profile duplicates. */
export function selectAccountIban(
  ibans: MoneriumIban[],
  address: string,
  chain: MoneriumChain,
  profileId: string
): MoneriumIban | null {
  const matches = ibans.filter(
    entry => entry.address.toLowerCase() === address.toLowerCase() && entry.chain === chain && entry.profile === profileId
  );
  if (matches.length > 1) {
    throw new Error(`Multiple Monerium IBANs matched ${profileId}:${chain}:${address.toLowerCase()}`);
  }
  return matches[0] ?? null;
}

/** GET /ibans — the IBAN issued for this exact profile/chain/address tuple. */
export async function getIbanForAddress(
  address: string,
  chain: MoneriumChain,
  profileId: string
): Promise<MoneriumIban | null> {
  return selectAccountIban(await listIbans(), address, chain, profileId);
}

/**
 * GET /addresses?profile={id} — the addresses linked to a profile. Used by the
 * association monitor (S1 detective control): any address linked to a client profile
 * beyond the forwarder is an alert condition.
 */
export function selectProfileChainAddresses(addresses: MoneriumAddress[], profileId: string, chain: MoneriumChain): string[] {
  return addresses.filter(entry => entry.profile === profileId && entry.chains.includes(chain)).map(entry => entry.address);
}

export async function getProfileAddresses(profileId: string, chain: MoneriumChain): Promise<string[]> {
  const response = await MoneriumApiService.getInstance().listAddresses({ profile: profileId });
  return selectProfileChainAddresses(response.addresses, profileId, chain);
}
