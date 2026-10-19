import { MONERIUM_ADDRESS_OWNERSHIP_MESSAGE, type MoneriumChain, type MoneriumIban } from "@vortexfi/shared";
import { Op } from "sequelize";
import type { Address } from "viem";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import { FinancialOperationRejectedError, runFinancialOperation } from "../phases/blocks/core/financial-operation";
import { signLinkAttestation } from "./attestor";
import { getChainId, moneriumChainForChainId } from "./chain";
import {
  getProfileAddresses,
  isWhitelabelConfigured,
  linkAddress,
  listIbans,
  requestIban,
  selectAccountIban
} from "./monerium-api";
import { refundAccountFor } from "./refund-wallet";

const ONBOARDING_FLOW = { id: "monerium-b2b-onboarding", version: 1 } as const;

export interface OnboardingDeps {
  getChainId(): Promise<number>;
  getProfileAddresses(profileId: string, chain: MoneriumChain): Promise<string[]>;
  linkAddress(profileId: string, address: string, chain: MoneriumChain, signature: string): Promise<unknown>;
  listIbans(): Promise<MoneriumIban[]>;
  requestIban(address: string, chain: MoneriumChain): Promise<unknown>;
  signLinkAttestation(chainId: bigint, forwarderAddress: Address): Promise<{ signature: string }>;
  /** The client's refund wallet and its signature over Monerium's ownership message. */
  signRefundLink(moneriumProfileId: string): Promise<{ address: string; signature: string }>;
}

const defaultDeps: OnboardingDeps = {
  getChainId,
  getProfileAddresses,
  linkAddress,
  listIbans,
  requestIban,
  signLinkAttestation,
  async signRefundLink(moneriumProfileId) {
    const wallet = refundAccountFor(moneriumProfileId);
    return { address: wallet.address, signature: await wallet.signMessage({ message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE }) };
  }
};

export function isOnboardingConfigured(): boolean {
  const { attestorPrivateKey, refundSeed, rpcUrl } = config.moneriumB2b;
  return Boolean(attestorPrivateKey && refundSeed && rpcUrl && isWhitelabelConfigured());
}

let configWarned = false;

async function isLinked(
  deps: OnboardingDeps,
  moneriumProfileId: string,
  address: string,
  chainName: MoneriumChain
): Promise<boolean> {
  const key = address.toLowerCase();
  const addresses = await deps.getProfileAddresses(moneriumProfileId, chainName);
  return addresses.some(linked => linked.toLowerCase() === key);
}

/**
 * Links `address` to the client's Monerium profile with `sign`'s ownership signature,
 * exactly once. `phase` names the ledger operation: the forwarder and the refund wallet
 * are separate provider writes.
 */
async function ensureLinked(
  deps: OnboardingDeps,
  account: MoneriumAccount,
  phase: "linkAddress" | "linkRefundAddress",
  address: string,
  sign: () => Promise<string>,
  chainName: MoneriumChain
): Promise<void> {
  if (await isLinked(deps, account.profileId, address, chainName)) return;
  await runFinancialOperation({
    attemptClass: "provider-address-link",
    flow: ONBOARDING_FLOW,
    perform: async () => {
      const signature = await sign();
      try {
        await deps.linkAddress(account.profileId, address, chainName, signature);
      } catch (error) {
        // Linking is synchronous upstream: if the address is not linked after a
        // failure, the call had no side effect — signal that so the ledger allows a
        // clean retry next cycle instead of parking the row in `unknown` forever.
        if (await isLinked(deps, account.profileId, address, chainName)) {
          return { linked: true };
        }
        throw new FinancialOperationRejectedError(
          `link call failed with no side effect: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return { linked: true };
    },
    phase,
    provider: "monerium",
    // A crash between the POST and its confirmation resolves by re-reading the
    // profile's linked addresses instead of issuing a second link call.
    reconcile: async () => ((await isLinked(deps, account.profileId, address, chainName)) ? { linked: true } : null),
    request: { address: address.toLowerCase(), chain: chainName, moneriumProfileId: account.profileId },
    retryFailed: true,
    // vortexProfileId is non-null for every account this loop selects.
    scopeId: account.vortexProfileId as string,
    scopeType: "profile"
  });
}

async function ensureIban(deps: OnboardingDeps, account: MoneriumAccount, chainName: MoneriumChain): Promise<void> {
  if (account.iban) return;
  const ibans = await deps.listIbans();
  const issued = selectAccountIban(ibans, account.forwarderAddress, chainName, account.profileId);
  if (issued) {
    await account.update({ iban: issued.iban, waitingReason: null });
    logger.info(`monerium-b2b: account ${account.id} has its IBAN and awaits activation`);
    return;
  }
  // Monerium issues one IBAN per profile and refuses a second one (400). Moving the profile's
  // IBAN to the forwarder makes every euro sent to it convert, which can break what the partner
  // uses it for, and leaves its old address linked (no unlink), which the association monitor
  // then reports: an operator decision taken with the partner. The read above adopts a moved IBAN.
  const existing = ibans.find(entry => entry.profile === account.profileId);
  if (existing) {
    if (account.waitingReason !== "monerium_profile_has_iban") {
      // Only while the row has no IBAN: an iban.updated delivery can record the moved IBAN between
      // the read above and this write, and must not end up next to a stale wait.
      const [recorded] = await MoneriumAccount.update(
        { waitingReason: "monerium_profile_has_iban" },
        { where: { iban: null, id: account.id } }
      );
      if (recorded > 0) {
        const onForwarder = existing.address.toLowerCase() === account.forwarderAddress.toLowerCase();
        logger.error(
          `monerium-b2b: account ${account.id} cannot get an IBAN: Monerium profile ${account.profileId} already has ` +
            `IBAN ${existing.iban} on ${onForwarder ? "the forwarder's address" : `address ${existing.address}`} ` +
            `on ${existing.chain}. Moving it to the forwarder on ${chainName} is an operator decision taken with the ` +
            "partner: every euro sent to that IBAN converts from then on" +
            (onForwarder
              ? ""
              : `, and ${existing.address} stays linked to the profile, so where that link covers ${chainName} the ` +
                "association monitor reports it on every pass once the account is active") +
            " (the internal B2B runbook §1.5)"
        );
      }
    }
    return;
  }
  if (account.waitingReason) await account.update({ waitingReason: null });
  await runFinancialOperation({
    attemptClass: "provider-iban-request",
    flow: ONBOARDING_FLOW,
    perform: async () => {
      try {
        await deps.requestIban(account.forwarderAddress, chainName);
      } catch (error) {
        // IBAN issuance is unique per (address, chain), so a repeated request can
        // never create a second IBAN — a failed call is safe to retry next cycle.
        // If the request did land, the reconcile read adopts the issued IBAN anyway.
        throw new FinancialOperationRejectedError(
          `iban request failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return { requested: true };
    },
    phase: "requestIban",
    provider: "monerium",
    reconcile: async () =>
      selectAccountIban(await deps.listIbans(), account.forwarderAddress, chainName, account.profileId)
        ? { requested: true }
        : null,
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
 * Monerium profile with the attestor signature and the client's refund wallet with its
 * own signature, then requests IBAN issuance for the forwarder. Every provider write
 * runs through the profile-scoped financial-operation ledger, so a crash or retry never
 * repeats a claimed call. Activation stays a manual operator step.
 */
export async function advanceOnboardingAccounts(deps: OnboardingDeps = defaultDeps): Promise<number> {
  if (!isOnboardingConfigured()) {
    if (!configWarned) {
      configWarned = true;
      logger.warn(
        "monerium-b2b: onboarding automation disabled — requires MONERIUM_WHITELABEL_CLIENT_ID/SECRET, MONERIUM_B2B_ATTESTOR_PRIVATE_KEY, MONERIUM_B2B_REFUND_SEED, and MONERIUM_B2B_RPC_URL"
      );
    }
    return 0;
  }

  const accounts = await MoneriumAccount.findAll({
    order: [["created_at", "ASC"]],
    // An account with its IBAN is fully linked (the IBAN request comes last) and only awaits activation.
    where: { iban: null, status: MoneriumAccountStatus.Onboarding, vortexProfileId: { [Op.ne]: null } }
  });
  if (accounts.length === 0) return 0;

  const chainId = await deps.getChainId();
  const chainName = moneriumChainForChainId(chainId);
  if (!chainName) {
    logger.error(`monerium-b2b: no Monerium chain name known for chain id ${chainId}; onboarding automation halted`);
    return 0;
  }

  let advanced = 0;
  for (const account of accounts) {
    try {
      const forwarder = account.forwarderAddress;
      await ensureLinked(
        deps,
        account,
        "linkAddress",
        forwarder,
        async () => (await deps.signLinkAttestation(BigInt(chainId), forwarder as Address)).signature,
        chainName
      );
      const refund = await deps.signRefundLink(account.profileId);
      await ensureLinked(deps, account, "linkRefundAddress", refund.address, async () => refund.signature, chainName);
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
