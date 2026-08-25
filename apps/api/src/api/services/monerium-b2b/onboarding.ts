import { Op } from "sequelize";
import type { Address } from "viem";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import { runFinancialOperation } from "../phases/blocks/core/financial-operation";
import { signLinkAttestation } from "./attestor";
import { getChainId } from "./chain";
import { getIbanForAddress, getProfileAddresses, linkAddress, requestIban } from "./whitelabel-client";

const ONBOARDING_FLOW = { id: "monerium-b2b-onboarding", version: 1 } as const;

// Monerium's chain identifiers for the chains the forwarder deploys to
// (docs.monerium.com chain values; the attestation binds the numeric chain id).
const MONERIUM_CHAIN_NAMES: Record<number, string> = {
  1: "ethereum",
  11155111: "sepolia"
};

export interface OnboardingDeps {
  getChainId(): Promise<number>;
  getIbanForAddress(address: string): Promise<{ iban: string } | null>;
  getProfileAddresses(profileId: string): Promise<string[]>;
  linkAddress(profileId: string, address: string, chain: string, signature: string): Promise<unknown>;
  requestIban(address: string, chain: string): Promise<unknown>;
  signLinkAttestation(chainId: bigint, forwarderAddress: Address): Promise<{ signature: string }>;
}

const defaultDeps: OnboardingDeps = {
  getChainId,
  getIbanForAddress,
  getProfileAddresses,
  linkAddress,
  requestIban,
  signLinkAttestation
};

export function isOnboardingConfigured(): boolean {
  const { attestorPrivateKey, clientId, clientSecret, rpcUrl } = config.moneriumB2b;
  return Boolean(attestorPrivateKey && clientId && clientSecret && rpcUrl);
}

let configWarned = false;

async function isForwarderLinked(deps: OnboardingDeps, moneriumProfileId: string, forwarderAddress: string): Promise<boolean> {
  const forwarderKey = forwarderAddress.toLowerCase();
  const addresses = await deps.getProfileAddresses(moneriumProfileId);
  return addresses.some(address => address.toLowerCase() === forwarderKey);
}

async function ensureLinked(deps: OnboardingDeps, account: MoneriumAccount, chainId: number, chainName: string): Promise<void> {
  if (await isForwarderLinked(deps, account.profileId, account.forwarderAddress)) return;
  await runFinancialOperation({
    attemptClass: "provider-address-link",
    flow: ONBOARDING_FLOW,
    perform: async () => {
      const attestation = await deps.signLinkAttestation(BigInt(chainId), account.forwarderAddress as Address);
      await deps.linkAddress(account.profileId, account.forwarderAddress, chainName, attestation.signature);
      return { linked: true };
    },
    phase: "linkAddress",
    provider: "monerium",
    // A crash between the POST and its confirmation resolves by re-reading the
    // profile's linked addresses instead of issuing a second link call.
    reconcile: async () =>
      (await isForwarderLinked(deps, account.profileId, account.forwarderAddress)) ? { linked: true } : null,
    request: { address: account.forwarderAddress.toLowerCase(), chain: chainName, moneriumProfileId: account.profileId },
    retryFailed: true,
    // vortexProfileId is non-null for every account this loop selects.
    scopeId: account.vortexProfileId as string,
    scopeType: "profile"
  });
}

async function ensureIban(deps: OnboardingDeps, account: MoneriumAccount, chainName: string): Promise<void> {
  if (account.iban) return;
  const issued = await deps.getIbanForAddress(account.forwarderAddress);
  if (issued) {
    await account.update({ iban: issued.iban });
    return;
  }
  await runFinancialOperation({
    attemptClass: "provider-iban-request",
    flow: ONBOARDING_FLOW,
    perform: async () => {
      await deps.requestIban(account.forwarderAddress, chainName);
      return { requested: true };
    },
    phase: "requestIban",
    provider: "monerium",
    reconcile: async () => ((await deps.getIbanForAddress(account.forwarderAddress)) ? { requested: true } : null),
    request: { address: account.forwarderAddress.toLowerCase(), chain: chainName },
    retryFailed: true,
    scopeId: account.vortexProfileId as string,
    scopeType: "profile"
  });
  // Issuance is asynchronous: the IBAN is recorded by the iban.updated webhook or
  // by the read at the top of the next cycle.
}

/**
 * Advances every mapped account still in onboarding: links its forwarder to the
 * Monerium profile with the attestor signature, then requests IBAN issuance. Both
 * provider writes run through the profile-scoped financial-operation ledger, so a
 * crash or retry never repeats a claimed call. Activation (after the penny test)
 * stays a manual operator step.
 */
export async function advanceOnboardingAccounts(deps: OnboardingDeps = defaultDeps): Promise<number> {
  if (!isOnboardingConfigured()) {
    if (!configWarned) {
      configWarned = true;
      logger.warn(
        "monerium-b2b: onboarding automation disabled — requires MONERIUM_B2B_CLIENT_ID/SECRET, MONERIUM_B2B_ATTESTOR_PRIVATE_KEY, and MONERIUM_B2B_RPC_URL"
      );
    }
    return 0;
  }

  const accounts = await MoneriumAccount.findAll({
    order: [["created_at", "ASC"]],
    where: { status: MoneriumAccountStatus.Onboarding, vortexProfileId: { [Op.ne]: null } }
  });
  if (accounts.length === 0) return 0;

  const chainId = await deps.getChainId();
  const chainName = MONERIUM_CHAIN_NAMES[chainId];
  if (!chainName) {
    logger.error(`monerium-b2b: no Monerium chain name known for chain id ${chainId}; onboarding automation halted`);
    return 0;
  }

  let advanced = 0;
  for (const account of accounts) {
    try {
      await ensureLinked(deps, account, chainId, chainName);
      await ensureIban(deps, account, chainName);
      advanced += 1;
    } catch (error) {
      // The next cycle retries; the financial-operation ledger keeps provider
      // writes exactly-once across retries.
      logger.error(`monerium-b2b: onboarding advance failed for account ${account.id}:`, error);
    }
  }
  return advanced;
}

export function resetOnboardingWarningForTests(): void {
  configWarned = false;
}
