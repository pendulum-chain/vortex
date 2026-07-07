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
import Partner from "../models/partner.model";
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

export async function createTestPartner(overrides: Partial<Parameters<typeof Partner.create>[0]> = {}): Promise<Partner> {
  const seq = nextSeq();
  return Partner.create({
    displayName: `Test Partner ${seq}`,
    isActive: true,
    logoUrl: null,
    markupCurrency: FiatToken.EURC,
    markupType: "none",
    markupValue: 0,
    maxDynamicDifference: 0,
    maxSubsidy: 0,
    minDynamicDifference: 0,
    name: `test-partner-${seq}`,
    payoutAddressEvm: null,
    payoutAddressSubstrate: null,
    rampType: RampDirection.BUY,
    targetDiscount: 0,
    vortexFeeType: "none",
    vortexFeeValue: 0,
    ...overrides
  });
}

/**
 * Creates a secret API key for a partner (or a user-scoped key when userId is given)
 * and returns both the DB record and the plaintext key for use in request headers.
 */
export async function createTestApiKey(
  options: { partnerName?: string; userId?: string } = {}
): Promise<{ record: ApiKey; plaintextKey: string }> {
  const plaintextKey = generateApiKey("secret", "test");
  const record = await ApiKey.create({
    expiresAt: null,
    isActive: true,
    keyHash: await hashApiKey(plaintextKey),
    keyPrefix: getKeyPrefix(plaintextKey),
    keyType: "secret",
    keyValue: null,
    lastUsedAt: null,
    name: "test key",
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
