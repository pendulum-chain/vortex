import {
  MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
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

/** GET /ibans — the IBAN issued for an address, or null if none yet. */
export async function getIbanForAddress(address: string): Promise<MoneriumIban | null> {
  const ibans = await listIbans();
  return ibans.find(entry => entry.address.toLowerCase() === address.toLowerCase()) ?? null;
}

/**
 * GET /addresses?profile={id} — the addresses linked to a profile. Used by the
 * association monitor (S1 detective control): any address linked to a client profile
 * beyond the forwarder is an alert condition.
 */
export async function getProfileAddresses(profileId: string): Promise<string[]> {
  const response = await MoneriumApiService.getInstance().listAddresses({ profile: profileId });
  return response.addresses.map(entry => entry.address);
}
