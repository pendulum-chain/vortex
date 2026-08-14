import { createHash } from "node:crypto";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { Op } from "sequelize";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import CustomerEntity from "../../../models/customerEntity.model";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { type ProviderName, VerificationStatus } from "../../../models/providerCustomer.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import RecipientInvitation from "../../../models/recipientInvitation.model";
import RecipientPayoutReference from "../../../models/recipientPayoutReference.model";
import SenderRecipient from "../../../models/senderRecipient.model";
import User from "../../../models/user.model";
import type { FlowGlobals, FlowMetadata } from "../phases/blocks/core/metadata";
import { resolveBlockFlow } from "../phases/blocks/flows/catalog";
import type { StateMetadata } from "../phases/meta-state-types";
import type { QuoteTicketMetadata } from "../quote/core/types";
import {
  DEMO_RECIPIENTS,
  DEMO_RESET_CORRIDOR,
  DEMO_SENDER_ENTITY_ID,
  DEMO_TRANSACTIONS,
  type DemoRecipientSeed,
  type DemoTransactionSeed,
  demoInvitationId,
  demoPayoutReferenceId,
  demoQuoteId,
  demoRampId,
  demoRecipientEntityId,
  demoRecipientProviderCustomerId,
  demoSenderRecipientId
} from "./demo-account.constants";

/** Placeholder counterparty on seeded history rows; never used for a real transfer. */
const DEMO_WALLET_ADDRESS = "0x000000000000000000000000000000000000dEmO";

export interface DemoRestoreSummary {
  profileId: string;
  senderEntityId: string;
  recipients: number;
  transactions: number;
  resetCorridorRowsRemoved: number;
}

/**
 * Rebuilds the sales-demo account to its pitch-ready state: an onboarded business, a
 * populated recipients list, and a transaction history with both completed and in-flight
 * rows. Every write is keyed by a fixed demo id, so running it twice is the same as
 * running it once and it can never overwrite a real ramp created during a demo.
 *
 * Sandbox only. See docs/operations-demo-environment.md.
 */
export async function restoreDemoAccount(): Promise<DemoRestoreSummary> {
  if (config.deploymentEnv !== "sandbox") {
    throw new Error(`Demo restore is sandbox-only; DEPLOYMENT_ENV is '${config.deploymentEnv}'`);
  }

  const profile = await User.findOne({ where: { email: config.demoAccountEmail } });
  if (!profile) {
    throw new Error(
      `No profile for ${config.demoAccountEmail}. The demo account must sign in once via OTP first — ` +
        "the seed cannot forge a Supabase Auth user."
    );
  }

  const senderEntity = await resolveSenderEntity(profile);
  const resetCorridorRowsRemoved = await wipeResetCorridor(senderEntity.id);

  for (const recipient of DEMO_RECIPIENTS) {
    await seedRecipient(senderEntity.id, profile.id, recipient);
  }
  for (const transaction of DEMO_TRANSACTIONS) {
    await seedTransaction(profile.id, transaction);
  }

  return {
    profileId: profile.id,
    recipients: DEMO_RECIPIENTS.length,
    resetCorridorRowsRemoved,
    senderEntityId: senderEntity.id,
    transactions: DEMO_TRANSACTIONS.length
  };
}

/**
 * Login hook: restores the demo account so every sales demo starts from the same state,
 * without the presenter having to run anything. A no-op for every other login, and never
 * a reason for a login to fail — the Supabase session is already minted by this point.
 */
export async function restoreDemoAccountOnLogin(email: string): Promise<void> {
  if (config.deploymentEnv !== "sandbox" || email.trim().toLowerCase() !== config.demoAccountEmail) {
    return;
  }

  try {
    await restoreDemoAccount();
  } catch (error) {
    logger.error("Failed to restore the demo account on login:", error);
  }
}

/**
 * The demo pitches a company account. `active_customer_entity_id` is immutable once set, so a
 * profile that picked "Individual" on first login cannot be converted here — say so plainly
 * instead of seeding a business entity the dashboard will never show.
 */
async function resolveSenderEntity(profile: User): Promise<CustomerEntity> {
  if (profile.activeCustomerEntityId) {
    const active = await CustomerEntity.findOne({ where: { id: profile.activeCustomerEntityId, profileId: profile.id } });
    if (!active) {
      throw new Error(`Profile ${profile.id} points at a customer entity it does not own`);
    }
    if (active.type !== "business") {
      throw new Error(
        `The demo profile's active entity is '${active.type}', but the demo account is a company. ` +
          "Active entity selection is immutable — delete the profile in Supabase and sign in again, choosing Company."
      );
    }
    return active;
  }

  const [entity] = await CustomerEntity.findOrCreate({
    defaults: { country: "BR", id: DEMO_SENDER_ENTITY_ID, profileId: profile.id, status: "active", type: "business" },
    where: { profileId: profile.id, type: "business" }
  });
  await profile.update({ activeCustomerEntityId: entity.id });
  return entity;
}

/**
 * Clears the corridor onboarded live during the demo so every run starts from an empty state.
 * Only this corridor's rows are touched — the real Avenia/BR customer stays intact.
 */
async function wipeResetCorridor(senderEntityId: string): Promise<number> {
  const staleCustomers = await ProviderCustomer.findAll({
    attributes: ["id"],
    where: { country: DEMO_RESET_CORRIDOR.country, customerEntityId: senderEntityId, provider: DEMO_RESET_CORRIDOR.provider }
  });
  if (staleCustomers.length === 0) {
    return 0;
  }

  const staleIds = staleCustomers.map(customer => customer.id);
  // kyc_cases has no country column, so the corridor is identified through the provider customer.
  await KycCase.destroy({ where: { customerEntityId: senderEntityId, providerCustomerId: { [Op.in]: staleIds } } });
  return ProviderCustomer.destroy({ where: { id: { [Op.in]: staleIds } } });
}

async function seedRecipient(senderEntityId: string, profileId: string, seed: DemoRecipientSeed): Promise<void> {
  const invitationId = demoInvitationId(seed.slot);
  await RecipientInvitation.upsert({
    acceptedAt: seed.relationship ? minutesFromNow(-60 * 24 * 3) : null,
    alias: seed.alias,
    archivedAt: null,
    country: seed.country,
    createdByProfileId: profileId,
    // The recipients controller sweeps pending invites past their expiry and clears their token,
    // so the window is pushed forward on every restore rather than written once.
    expiresAt: minutesFromNow(60 * 24 * 14),
    id: invitationId,
    inviteeEmail: seed.inviteeEmail,
    inviteeEmailCanonical: seed.inviteeEmail.toLowerCase(),
    inviteeType: "business",
    payoutCurrency: seed.payoutCurrency,
    rail: seed.rail,
    revokedAt: null,
    senderCustomerEntityId: senderEntityId,
    status: seed.relationship ? "accepted" : "pending",
    token: seed.relationship ? null : `demo-invite-token-${seed.slot}`,
    tokenHash: createHash("sha256").update(`demo-invitation-${seed.slot}`).digest("hex")
  });

  if (!seed.relationship) {
    // Invitation only: the recipients view lists this as an outstanding invite.
    return;
  }

  const recipientEntityId = demoRecipientEntityId(seed.slot);
  await CustomerEntity.upsert({
    country: seed.country,
    id: recipientEntityId,
    profileId: null,
    status: "active",
    type: "business"
  });

  const senderRecipientId = demoSenderRecipientId(seed.slot);
  await SenderRecipient.upsert({
    disabledAt: null,
    id: senderRecipientId,
    invitationId,
    nickname: seed.alias,
    rail: seed.rail,
    recipientCustomerEntityId: recipientEntityId,
    relationshipStatus: "active",
    senderCustomerEntityId: senderEntityId
  });

  const { approved } = seed.relationship;
  if (!approved) {
    // No provider customer and no payout reference: the recipients view reads this as pending review.
    return;
  }

  const provider = providerForDemoRail(seed.rail);
  const providerCustomerId = demoRecipientProviderCustomerId(seed.slot);
  await ProviderCustomer.upsert({
    companyName: seed.alias,
    country: seed.country,
    customerEntityId: recipientEntityId,
    customerType: "business",
    id: providerCustomerId,
    provider,
    providerCustomerId: `demo-${seed.rail}-${seed.slot}`,
    rail: seed.rail,
    status: VerificationStatus.Approved
  });

  const payoutReferenceId = demoPayoutReferenceId(seed.slot);
  await RecipientPayoutReference.upsert({
    country: seed.country,
    currency: seed.payoutCurrency,
    id: payoutReferenceId,
    instrumentType: approved.instrumentType,
    maskedDisplayLabel: approved.maskedDisplayLabel,
    provider,
    providerInstrumentId: `demo-instrument-${seed.slot}`,
    rail: seed.rail,
    recipientCustomerEntityId: recipientEntityId,
    senderRecipientId,
    status: "verified"
  });
}

/** Mirrors providerForRail in the recipients transfer-eligibility service, which computes displayed status. */
function providerForDemoRail(rail: string): ProviderName {
  if (rail === "eur") return "monerium";
  if (rail === "brl") return "avenia";
  return "alfredpay";
}

/**
 * The API refuses to boot when a resumable ramp's quote carries unusable block-flow metadata
 * (`assertPersistedBlockFlowVersionsSupported`), so the seeded rows have to hold the real
 * envelope. It is resolved from the catalog rather than hardcoded, so the seed follows the
 * flow definitions instead of drifting behind them.
 */
function buildSeedFlowMetadata(profileId: string, seed: DemoTransactionSeed) {
  const isBuy = seed.direction === "buy";
  const request: FlowGlobals["request"] = {
    countryCode: "BR",
    from: isBuy ? EPaymentMethod.PIX : Networks.PolygonAmoy,
    inputAmount: seed.inputAmount,
    inputCurrency: isBuy ? FiatToken.BRL : EvmToken.USDC,
    network: Networks.PolygonAmoy,
    outputCurrency: isBuy ? EvmToken.USDC : FiatToken.BRL,
    paymentMethod: EPaymentMethod.PIX,
    rampType: isBuy ? RampDirection.BUY : RampDirection.SELL,
    to: isBuy ? Networks.PolygonAmoy : EPaymentMethod.PIX,
    userId: profileId
  };

  const flow = resolveBlockFlow(request);
  const metadata: FlowMetadata = {
    // Empty per-block records: the envelope has to be structurally valid, but these rows are
    // never resumed, so there is no simulation to persist.
    blocks: Object.fromEntries(flow.contextKeys.map(key => [key, {}])),
    flow: flow.identity,
    globals: {
      fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
      partner: null,
      request
    }
  };

  return { flow, metadata: metadata as unknown as QuoteTicketMetadata, request };
}

async function seedTransaction(profileId: string, seed: DemoTransactionSeed): Promise<void> {
  const createdAt = minutesFromNow(-seed.ageMinutes);
  const quoteId = demoQuoteId(seed.slot);
  const { flow, metadata, request } = buildSeedFlowMetadata(profileId, seed);

  await QuoteTicket.upsert({
    apiCredentialId: null,
    apiKey: null,
    countryCode: "BR",
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
    flowVariant: config.flowVariant,
    from: request.from,
    id: quoteId,
    inputAmount: seed.inputAmount,
    inputCurrency: request.inputCurrency,
    metadata,
    network: Networks.PolygonAmoy,
    outputAmount: seed.outputAmount,
    outputCurrency: request.outputCurrency,
    partnerId: null,
    paymentMethod: EPaymentMethod.PIX,
    pricingPartnerId: null,
    rampType: request.rampType,
    status: "consumed",
    to: request.to,
    updatedAt: createdAt,
    userId: profileId
  });

  const rampId = demoRampId(seed.slot);
  await RampState.upsert({
    createdAt,
    currentPhase: seed.phase,
    errorLogs: [],
    flowVariant: config.flowVariant,
    from: request.from,
    id: rampId,
    paymentMethod: EPaymentMethod.PIX,
    phaseHistory: [{ phase: seed.phase, timestamp: createdAt }],
    postCompleteState: { cleanup: { cleanupAt: null, cleanupCompleted: seed.phase === "complete", errors: null } },
    // RampRecoveryWorker only picks up ramps that have presigned transactions. Leaving these null
    // is what keeps the in-flight rows sitting at processing instead of decaying to failed.
    presignedTxs: null,
    processingLock: { locked: false, lockedAt: null },
    quoteId,
    // The startup assertion validates the flow identity and phase sequence of every resumable
    // ramp, so both are written here rather than being back-filled on the first boot.
    state: {
      destinationAddress: DEMO_WALLET_ADDRESS,
      flow: flow.identity,
      phaseFlow: ["initial", ...flow.phases, "complete"],
      walletAddress: DEMO_WALLET_ADDRESS
    } as StateMetadata,
    to: request.to,
    type: request.rampType,
    // The model rejects an empty array; one inert placeholder satisfies it without being signable.
    unsignedTxs: [
      { meta: {}, network: Networks.PolygonAmoy, nonce: 0, phase: seed.phase, signer: DEMO_WALLET_ADDRESS, txData: "0x" }
    ],
    updatedAt: createdAt,
    userId: profileId
  });

  // Sequelize stamps its own timestamps on upsert, so the createdAt passed above is discarded
  // and every row would read as "just now". Forcing them afterwards is what keeps the seeded
  // ages (`ageMinutes`) visible in the history.
  await QuoteTicket.update({ createdAt, updatedAt: createdAt }, { silent: true, where: { id: quoteId } });
  await RampState.update({ createdAt, updatedAt: createdAt }, { silent: true, where: { id: rampId } });
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
