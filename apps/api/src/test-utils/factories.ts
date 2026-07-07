import {
  AlfredPayCountry,
  AlfredPayStatus,
  AlfredPayType,
  AveniaAccountType,
  type DestinationType,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  type UnsignedTx
} from "@vortexfi/shared";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../api/middlewares/apiKeyAuth.helpers";
import type { StateMetadata } from "../api/services/phases/meta-state-types";
import type { QuoteTicketMetadata } from "../api/services/quote/core/types";
import { config } from "../config/vars";
import AlfredPayCustomer from "../models/alfredPayCustomer.model";
import ApiKey from "../models/apiKey.model";
import Partner, { type PartnerAttributes } from "../models/partner.model";
import PartnerPricingConfig, { type PartnerPricingConfigAttributes } from "../models/partnerPricingConfig.model";
import QuoteTicket, { type QuoteTicketAttributes } from "../models/quoteTicket.model";
import RampState, { type RampStateAttributes } from "../models/rampState.model";
import TaxId, { TaxIdInternalStatus } from "../models/taxId.model";
import User from "../models/user.model";

let sequence = 0;
function nextSeq(): number {
  return ++sequence;
}

export async function createTestUser(overrides: Partial<{ id: string; email: string }> = {}): Promise<User> {
  const seq = nextSeq();
  return User.create({
    email: overrides.email ?? `test-user-${seq}@example.com`,
    id: overrides.id ?? crypto.randomUUID()
  });
}

type TestPartnerOverrides = Partial<
  Pick<PartnerAttributes, "name" | "displayName" | "isActive" | "logoUrl"> &
    Omit<PartnerPricingConfigAttributes, "id" | "partnerId" | "createdAt" | "updatedAt">
>;

/**
 * Creates (or reuses, when the unique name already exists) a partner row plus a pricing
 * config for the given rampType — the post-split equivalent of the old one-row-per-direction
 * partner. Pricing overrides land on the config.
 */
export async function createTestPartner(overrides: TestPartnerOverrides = {}): Promise<Partner> {
  const seq = nextSeq();
  const name = overrides.name ?? `test-partner-${seq}`;

  const [partner] = await Partner.findOrCreate({
    defaults: {
      displayName: overrides.displayName ?? `Test Partner ${seq}`,
      isActive: overrides.isActive ?? true,
      logoUrl: overrides.logoUrl ?? null,
      name
    },
    where: { name }
  });

  await PartnerPricingConfig.create({
    isActive: overrides.isActive ?? true,
    markupCurrency: overrides.markupCurrency ?? FiatToken.EURC,
    markupType: overrides.markupType ?? "none",
    markupValue: overrides.markupValue ?? 0,
    maxDynamicDifference: overrides.maxDynamicDifference ?? 0,
    maxSubsidy: overrides.maxSubsidy ?? 0,
    minDynamicDifference: overrides.minDynamicDifference ?? 0,
    partnerId: partner.id,
    payoutAddressEvm: overrides.payoutAddressEvm ?? null,
    payoutAddressSubstrate: overrides.payoutAddressSubstrate ?? null,
    rampType: overrides.rampType ?? RampDirection.BUY,
    targetDiscount: overrides.targetDiscount ?? 0,
    vortexFeeType: overrides.vortexFeeType ?? "none",
    vortexFeeValue: overrides.vortexFeeValue ?? 0
  });

  return partner;
}

/**
 * Creates a secret API key for a partner (or a user-scoped key when userId is given)
 * and returns both the DB record and the plaintext key for use in request headers.
 */
export async function createTestApiKey(
  options: { partnerName?: string; userId?: string } = {}
): Promise<{ record: ApiKey; plaintextKey: string }> {
  const plaintextKey = generateApiKey("secret", "test");

  // Auth resolves partners by FK; translate the name (unique) to the id here so tests can
  // keep passing partnerName.
  let partnerId: string | null = null;
  if (options.partnerName) {
    const partner = await Partner.findOne({ where: { name: options.partnerName } });
    partnerId = partner?.id ?? null;
  }

  const record = await ApiKey.create({
    expiresAt: null,
    isActive: true,
    keyHash: await hashApiKey(plaintextKey),
    keyPrefix: getKeyPrefix(plaintextKey),
    keyType: "secret",
    keyValue: null,
    lastUsedAt: null,
    name: "test key",
    partnerId,
    partnerName: options.partnerName ?? null,
    userId: options.userId ?? null
  });
  return { plaintextKey, record };
}

/** Minimal complete fee structure so status/fee readers work; override per test. */
export function defaultQuoteFees(currency: FiatToken = FiatToken.EURC): NonNullable<QuoteTicketMetadata["fees"]> {
  return {
    displayFiat: { anchor: "1", currency, network: "0", partnerMarkup: "0", total: "1", vortex: "0" },
    usd: { anchor: "1", network: "0", partnerMarkup: "0", total: "1", vortex: "0" }
  };
}

/**
 * A pending EUR→USDC-on-Base onramp quote by default; override anything.
 * Metadata carries a minimal fee structure — pass a realistic `metadata`
 * override for tests that exercise ramp registration.
 */
export async function createTestQuote(overrides: Partial<QuoteTicketAttributes> = {}): Promise<QuoteTicket> {
  return QuoteTicket.create({
    apiKey: null,
    countryCode: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    flowVariant: config.flowVariant,
    from: EPaymentMethod.SEPA as DestinationType,
    inputAmount: "100",
    inputCurrency: FiatToken.EURC,
    metadata: { fees: defaultQuoteFees(), ...(overrides.metadata ?? {}) } as QuoteTicketMetadata,
    network: Networks.Base,
    outputAmount: "105",
    outputCurrency: EvmToken.USDC,
    partnerId: null,
    paymentMethod: EPaymentMethod.SEPA,
    pricingPartnerId: null,
    rampType: RampDirection.BUY,
    status: "pending",
    to: Networks.Base as DestinationType,
    userId: null,
    ...overrides
  });
}

/**
 * Baseline configuration the quote pipeline expects in every environment:
 * the "vortex" partner rows carrying the default platform fee (zero here;
 * tests that assert fee math override via createTestPartner).
 */
export async function seedVortexPartners(): Promise<void> {
  for (const rampType of [RampDirection.BUY, RampDirection.SELL]) {
    await createTestPartner({ displayName: "Vortex", name: "vortex", rampType });
  }
}

/** Updates a partner's pricing config for one direction (post-split home of payout/fee fields). */
export async function updatePartnerPricing(
  name: string,
  rampType: RampDirection,
  values: Partial<Omit<PartnerPricingConfigAttributes, "id" | "partnerId" | "createdAt" | "updatedAt">>
): Promise<void> {
  const partner = await Partner.findOne({ where: { name } });
  if (!partner) {
    throw new Error(`updatePartnerPricing: no partner named '${name}'`);
  }
  await PartnerPricingConfig.update(values, { where: { partnerId: partner.id, rampType } });
}

/** An Alfredpay-KYC'd customer linked to a user, as required by MXN/COP/USD/ARS ramp registration. */
export async function createTestAlfredpayCustomer(
  userId: string,
  overrides: Partial<{ alfredPayId: string; country: AlfredPayCountry }> = {}
): Promise<AlfredPayCustomer> {
  const seq = nextSeq();
  return AlfredPayCustomer.create({
    alfredPayId: overrides.alfredPayId ?? `test-alfredpay-customer-${seq}`,
    country: overrides.country ?? AlfredPayCountry.MX,
    lastFailureReasons: null,
    status: AlfredPayStatus.Success,
    statusExternal: null,
    type: AlfredPayType.INDIVIDUAL,
    userId
  });
}

/** An Avenia-KYC'd tax id linked to a user, as required by BRL ramp registration. */
export async function createTestTaxId(userId: string, overrides: Partial<{ taxId: string; subAccountId: string }> = {}) {
  const seq = nextSeq();
  return TaxId.create({
    accountType: AveniaAccountType.INDIVIDUAL,
    finalQuoteId: null,
    finalSessionId: null,
    finalTimestamp: null,
    initialQuoteId: null,
    initialSessionId: null,
    internalStatus: TaxIdInternalStatus.Accepted,
    kycAttempt: null,
    requestedDate: new Date(),
    subAccountId: overrides.subAccountId ?? "test-subaccount-id",
    taxId: overrides.taxId ?? `1234567890${seq}`,
    userId
  });
}

const DEFAULT_UNSIGNED_TX: UnsignedTx = {
  network: Networks.Base,
  nonce: 0,
  phase: "destinationTransfer",
  signer: "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3",
  txData: "0x"
} as UnsignedTx;

/**
 * A ramp state in its initial phase, linked to a fresh quote unless quoteId is given.
 */
export async function createTestRampState(overrides: Partial<RampStateAttributes> = {}): Promise<RampState> {
  const quoteId = overrides.quoteId ?? (await createTestQuote()).id;
  return RampState.create({
    currentPhase: "initial",
    errorLogs: [],
    flowVariant: config.flowVariant,
    from: EPaymentMethod.SEPA as DestinationType,
    paymentMethod: EPaymentMethod.SEPA,
    phaseHistory: [],
    postCompleteState: { cleanup: { cleanupAt: null, cleanupCompleted: false, errors: null } },
    presignedTxs: null,
    processingLock: { locked: false, lockedAt: null },
    state: (overrides.state ?? {}) as StateMetadata,
    to: Networks.Base,
    type: RampDirection.BUY,
    unsignedTxs: [DEFAULT_UNSIGNED_TX],
    userId: null,
    ...overrides,
    quoteId
  });
}
