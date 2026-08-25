/**
 * External API contract: Monerium white-label API v2 (docs/operations-testing.md).
 *
 * Read-only live checks require MONERIUM_WHITELABEL_CLIENT_ID/MONERIUM_WHITELABEL_CLIENT_SECRET and may use:
 *  - MONERIUM_CONTRACT_PROFILE_ID
 *  - MONERIUM_CONTRACT_ADDRESS
 *  - MONERIUM_CONTRACT_IBAN
 *  - MONERIUM_CONTRACT_ORDER_ID
 *
 * Mutating checks are prepared but independently opt-in because they create persistent
 * sandbox resources or can move sandbox EURe:
 *  - MONERIUM_CONTRACT_RUN_ADDRESS_FLOW=1 plus PROFILE_ID, ADDRESS, ADDRESS_CHAIN, ADDRESS_SIGNATURE
 *  - MONERIUM_CONTRACT_RUN_IBAN_FLOW=1 plus ADDRESS and ADDRESS_CHAIN
 *  - MONERIUM_CONTRACT_RUN_ORDER_FLOW=1 plus MONERIUM_CONTRACT_ORDER_REQUEST_JSON
 *  - MONERIUM_CONTRACT_RUN_FILE_UPLOAD=1
 *  - MONERIUM_CONTRACT_RUN_WEBHOOK_FLOW=1 plus WEBHOOK_URL and WEBHOOK_SECRET
 *
 * The address signature is sent unchanged. For a Safe off-chain EIP-1271 flow it must be
 * the combined owner-signature bytes assembled externally; there is no extra endpoint.
 */
import { describe, expect, test } from "bun:test";
import {
  MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
  type MoneriumChain,
  MoneriumApiService,
  MoneriumContractError,
  type MoneriumRedeemOrderRequest,
  moneriumAddressSchema,
  moneriumIbanSchema,
  moneriumListAddressesResponseSchema,
  moneriumListIbansResponseSchema,
  moneriumListOrdersResponseSchema,
  moneriumListProfilesResponseSchema,
  moneriumOrderSchema,
  moneriumProfileSchema,
  moneriumRedeemOrderRequestSchema,
  moneriumUploadedFileSchema,
  moneriumWebhookEventSchema,
  moneriumWebhookSubscriptionSchema,
  moneriumListWebhooksResponseSchema
} from "@vortexfi/shared";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";

const RUN_LIVE = process.env.RUN_LIVE_TESTS === "1";
const HAS_CREDS = !!(
  process.env.MONERIUM_WHITELABEL_CLIENT_ID && process.env.MONERIUM_WHITELABEL_CLIENT_SECRET
);
const PROFILE_ID = process.env.MONERIUM_CONTRACT_PROFILE_ID;
const ADDRESS = process.env.MONERIUM_CONTRACT_ADDRESS;
const ADDRESS_CHAIN = process.env.MONERIUM_CONTRACT_ADDRESS_CHAIN as MoneriumChain | undefined;
const IBAN = process.env.MONERIUM_CONTRACT_IBAN;
const ORDER_ID = process.env.MONERIUM_CONTRACT_ORDER_ID;
const RUN_ADDRESS_FLOW = process.env.MONERIUM_CONTRACT_RUN_ADDRESS_FLOW === "1";
const RUN_IBAN_FLOW = process.env.MONERIUM_CONTRACT_RUN_IBAN_FLOW === "1";
const RUN_ORDER_FLOW = process.env.MONERIUM_CONTRACT_RUN_ORDER_FLOW === "1";
const RUN_FILE_UPLOAD = process.env.MONERIUM_CONTRACT_RUN_FILE_UPLOAD === "1";
const RUN_WEBHOOK_FLOW = process.env.MONERIUM_CONTRACT_RUN_WEBHOOK_FLOW === "1";

const FIXTURE_PROFILE_ID = "123e4567-e89b-42d3-a456-426614174000";
const FIXTURE_RESOURCE_ID = "223e4567-e89b-42d3-a456-426614174001";
const FIXTURE_ADDRESS = "0x59cFC408d310697f9D3598e1BE75B0157a072407";
const FIXTURE_IBAN = "EE521273842688571285";

if (RUN_LIVE && !HAS_CREDS) {
  console.warn(
    "[contract:live] Monerium live half skipped: " +
      "MONERIUM_WHITELABEL_CLIENT_ID/MONERIUM_WHITELABEL_CLIENT_SECRET not set"
  );
}

function assertSandboxMutationTarget(rawUrl = process.env.MONERIUM_API_URL): void {
  if (!rawUrl) throw new Error("MONERIUM_API_URL must be set explicitly for mutating contract tests");
  const url = new URL(rawUrl);
  if (url.origin !== "https://api.monerium.dev" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Mutating Monerium contract tests require exactly https://api.monerium.dev");
  }
}

function orderFixture() {
  return {
    address: FIXTURE_ADDRESS,
    amount: "100.00",
    chain: "ethereum",
    counterpart: {
      details: { country: "EE", firstName: "Jane", lastName: "Doe" },
      identifier: { iban: FIXTURE_IBAN, standard: "iban" }
    },
    currency: "eur",
    id: FIXTURE_RESOURCE_ID,
    kind: "redeem",
    memo: "Powered by Monerium",
    meta: { placedAt: "2026-08-25T12:00:00Z" },
    profile: FIXTURE_PROFILE_ID,
    state: "placed"
  };
}

describe("Monerium external API contract - hermetic fixtures", () => {
  test("profile, address, and IBAN responses satisfy consumed contracts", () => {
    const profile = {
      details: { state: "approved" },
      form: { state: "approved" },
      id: FIXTURE_PROFILE_ID,
      kind: "personal",
      name: "Jane Doe",
      state: "approved",
      verifications: [{ kind: "idDocument", state: "approved" }]
    };
    expect(() => moneriumListProfilesResponseSchema.parse({ profiles: [profile] })).not.toThrow();
    expect(() => moneriumProfileSchema.parse(profile)).not.toThrow();
    expect(() =>
      moneriumListAddressesResponseSchema.parse({
        addresses: [{ address: FIXTURE_ADDRESS, chains: ["ethereum"], profile: FIXTURE_PROFILE_ID }]
      })
    ).not.toThrow();
    expect(() =>
      moneriumListIbansResponseSchema.parse({
        ibans: [
          {
            address: FIXTURE_ADDRESS,
            bic: "CBHFLU2LXXX",
            chain: "ethereum",
            iban: FIXTURE_IBAN,
            name: "Jane Doe",
            profile: FIXTURE_PROFILE_ID
          }
        ]
      })
    ).not.toThrow();
  });

  test("redeem request and order response preserve signing semantics", () => {
    const timestamp = `${new Date(Date.now() + 60_000).toISOString().slice(0, 16)}Z`;
    const request = {
      address: FIXTURE_ADDRESS,
      amount: "100.00",
      chain: "ethereum",
      counterpart: {
        details: { country: "EE", firstName: "Jane", lastName: "Doe" },
        identifier: { iban: FIXTURE_IBAN, standard: "iban" }
      },
      currency: "eur",
      kind: "redeem",
      message: `Send EUR 100.00 to ${FIXTURE_IBAN} at ${timestamp}`,
      signature: `0x${"ab".repeat(65)}`
    };
    expect(() => moneriumRedeemOrderRequestSchema.parse(request)).not.toThrow();
    expect(() => moneriumListOrdersResponseSchema.parse({ orders: [orderFixture()] })).not.toThrow();
  });

  test("webhook event fixtures preserve event discriminators", () => {
    expect(() =>
      moneriumWebhookEventSchema.parse({
        data: orderFixture(),
        timestamp: "2026-08-25T12:01:00Z",
        type: "order.updated"
      })
    ).not.toThrow();
    expect(() =>
      moneriumWebhookEventSchema.parse({
        data: { id: FIXTURE_PROFILE_ID, kind: "personal", state: "approved" },
        timestamp: "2026-08-25T12:01:00Z",
        type: "profile.updated"
      })
    ).not.toThrow();
    expect(() =>
      moneriumWebhookEventSchema.parse({
        data: {
          address: FIXTURE_ADDRESS,
          chain: "ethereum",
          iban: "EE52 1273 8426 8857 1285",
          profile: FIXTURE_PROFILE_ID,
          state: "approved"
        },
        timestamp: "2026-08-25T12:01:00Z",
        type: "iban.updated"
      })
    ).not.toThrow();
  });

  test("provider contract violations fail instead of becoming inconclusive", async () => {
    await expect(
      runLive("monerium malformed success", async () => {
        throw new MoneriumContractError("GET /profiles");
      })
    ).rejects.toBeInstanceOf(MoneriumContractError);
  });

  test("mutating checks refuse the production API", () => {
    expect(() => assertSandboxMutationTarget("https://api.monerium.app")).toThrow();
    expect(() => assertSandboxMutationTarget("https://api.monerium.dev/v2")).toThrow();
    expect(() => assertSandboxMutationTarget("https://api.monerium.dev")).not.toThrow();
  });
});

describe.skipIf(!RUN_LIVE || !HAS_CREDS)("Monerium external API contract - live sandbox", () => {
  const api = () => MoneriumApiService.getInstance();

  test("GET profile collection and fixture profile satisfy API v2 contracts", async () => {
    const profiles = await runLive("monerium listProfiles", () => api().listProfiles());
    if (!profiles) return;
    const parsed = moneriumListProfilesResponseSchema.parse(profiles);

    const profileId = PROFILE_ID ?? parsed.profiles[0]?.id;
    if (!profileId) return;
    const profile = await runLive("monerium getProfile", () => api().getProfile(profileId));
    if (profile) moneriumProfileSchema.parse(profile);
  });

  test("GET address, IBAN, and order collections satisfy API v2 contracts", async () => {
    const addresses = await runLive("monerium listAddresses", () => api().listAddresses({ profile: PROFILE_ID }));
    if (addresses) moneriumListAddressesResponseSchema.parse(addresses);

    const ibans = await runLive("monerium listIbans", () => api().listIbans({ profile: PROFILE_ID }));
    if (ibans) moneriumListIbansResponseSchema.parse(ibans);

    const orders = await runLive("monerium listOrders", () => api().listOrders({ profile: PROFILE_ID }));
    if (orders) moneriumListOrdersResponseSchema.parse(orders);
  });

  test.skipIf(!ADDRESS)("GET fixture address satisfies the address contract", async () => {
    const address = await runLive("monerium getAddress", () => api().getAddress(ADDRESS as string));
    if (address) moneriumAddressSchema.parse(address);
  });

  test.skipIf(!IBAN)("GET fixture IBAN satisfies the IBAN contract", async () => {
    const iban = await runLive("monerium getIban", () => api().getIban(IBAN as string));
    if (iban) moneriumIbanSchema.parse(iban);
  });

  test.skipIf(!ORDER_ID)("GET fixture order satisfies the order contract", async () => {
    const order = await runLive("monerium getOrder", () => api().getOrder(ORDER_ID as string));
    if (order) moneriumOrderSchema.parse(order);
  });

  test.skipIf(!RUN_ADDRESS_FLOW || !PROFILE_ID || !ADDRESS || !ADDRESS_CHAIN || !process.env.MONERIUM_CONTRACT_ADDRESS_SIGNATURE)(
    "POST /addresses accepts the prepared ownership proof",
    async () => {
      assertSandboxMutationTarget();
      const result = await runLive("monerium linkAddress", () =>
        api().linkAddress({
          address: ADDRESS as string,
          chain: ADDRESS_CHAIN as MoneriumChain,
          message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
          profile: PROFILE_ID as string,
          signature: process.env.MONERIUM_CONTRACT_ADDRESS_SIGNATURE as string
        })
      );
      if (result) expect([201, 202]).toContain(result.httpStatus);
    }
  );

  test.skipIf(!RUN_IBAN_FLOW || !ADDRESS || !ADDRESS_CHAIN)(
    "POST /ibans preserves accepted and already-provisioned semantics",
    async () => {
      assertSandboxMutationTarget();
      const result = await runLive("monerium requestIban", () =>
        api().requestIban({ address: ADDRESS as string, chain: ADDRESS_CHAIN as MoneriumChain })
      );
      if (result) expect([202, 304]).toContain(result.httpStatus);
    }
  );

  test.skipIf(!RUN_ORDER_FLOW || !process.env.MONERIUM_CONTRACT_ORDER_REQUEST_JSON)(
    "POST /orders accepts a freshly signed sandbox redemption",
    async () => {
      assertSandboxMutationTarget();
      const request = moneriumRedeemOrderRequestSchema.parse(
        JSON.parse(process.env.MONERIUM_CONTRACT_ORDER_REQUEST_JSON as string)
      ) as MoneriumRedeemOrderRequest;
      const result = await runLive("monerium createRedemptionOrder", () => api().createRedemptionOrder(request));
      if (result?.httpStatus === 200) moneriumOrderSchema.parse(result.order);
      if (result) expect([200, 202]).toContain(result.httpStatus);
    }
  );

  test.skipIf(!RUN_FILE_UPLOAD)("POST /files accepts the documented multipart contract", async () => {
    assertSandboxMutationTarget();
    const pdf = new Blob(["%PDF-1.4\n%%EOF\n"], { type: "application/pdf" });
    const uploaded = await runLive("monerium uploadFile", () => api().uploadFile(pdf, "vortex-contract-test.pdf"));
    if (uploaded) moneriumUploadedFileSchema.parse(uploaded);
  });

  test.skipIf(
    !RUN_WEBHOOK_FLOW || !process.env.MONERIUM_CONTRACT_WEBHOOK_URL || !process.env.MONERIUM_CONTRACT_WEBHOOK_SECRET
  )("POST + GET + PATCH /webhooks create and deactivate a subscription", async () => {
    assertSandboxMutationTarget();
    let subscriptionId: string | undefined;
    try {
      const created = await runLive("monerium createWebhook", () =>
        api().createWebhook({
          secret: process.env.MONERIUM_CONTRACT_WEBHOOK_SECRET as string,
          types: ["profile.updated", "profile.error", "iban.updated", "order.created", "order.updated"],
          url: process.env.MONERIUM_CONTRACT_WEBHOOK_URL as string
        })
      );
      if (!created) return;
      subscriptionId = moneriumWebhookSubscriptionSchema.parse(created).id;

      const subscriptions = await runLive("monerium listWebhooks", () => api().listWebhooks());
      if (subscriptions) {
        const parsed = moneriumListWebhooksResponseSchema.parse(subscriptions);
        expect(parsed.subscriptions.map(subscription => subscription.id)).toContain(subscriptionId);
      }
    } finally {
      if (subscriptionId) {
        await runLive("monerium deactivateWebhook", () => api().updateWebhook(subscriptionId as string, { state: "inactive" }));
      }
    }
  });
});

// Monerium is not in contracts.yml until sandbox white-label credentials and fixtures are provisioned.
test.skipIf(!RUN_LIVE || !HAS_CREDS)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
