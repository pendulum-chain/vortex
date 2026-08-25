import { describe, expect, test } from "bun:test";
import {
  moneriumAccessTokenResponseSchema,
  moneriumAddressSchema,
  moneriumCreateWebhookRequestSchema,
  moneriumIbanSchema,
  moneriumLinkAddressRequestSchema,
  moneriumListOrdersResponseSchema,
  moneriumProfileSchema,
  moneriumRedeemOrderRequestSchema,
  moneriumUploadedFileSchema,
  moneriumWebhookEventSchema
} from "./schemas";
import { MONERIUM_ADDRESS_OWNERSHIP_MESSAGE } from "./types";

const PROFILE_ID = "123e4567-e89b-42d3-a456-426614174000";
const RESOURCE_ID = "223e4567-e89b-42d3-a456-426614174001";
const ADDRESS = "0x59cFC408d310697f9D3598e1BE75B0157a072407";
const IBAN = "EE521273842688571285";

function profile() {
  return {
    details: { state: "approved" },
    form: { state: "approved" },
    id: PROFILE_ID,
    kind: "personal",
    name: "Jane Doe",
    state: "approved",
    unknownProviderField: true,
    verifications: [{ kind: "idDocument", state: "approved" }]
  };
}

function order() {
  return {
    address: ADDRESS,
    amount: "100.00",
    chain: "ethereum",
    counterpart: {
      details: { country: "EE", firstName: "Jane", lastName: "Doe" },
      identifier: { iban: IBAN, standard: "iban" }
    },
    currency: "eur",
    id: RESOURCE_ID,
    kind: "redeem",
    memo: "Powered by Monerium",
    meta: { placedAt: "2026-08-25T12:00:00Z" },
    profile: PROFILE_ID,
    state: "placed"
  };
}

function redeemRequest(amount = "100.00") {
  const timestamp = `${new Date(Date.now() + 60_000).toISOString().slice(0, 16)}Z`;
  return {
    address: ADDRESS,
    amount,
    chain: "ethereum",
    counterpart: {
      details: { country: "EE", firstName: "Jane", lastName: "Doe" },
      identifier: { iban: IBAN, standard: "iban" }
    },
    currency: "eur",
    kind: "redeem",
    message: `Send EUR ${amount} to ${IBAN} at ${timestamp}`,
    signature: `0x${"ab".repeat(65)}`
  };
}

describe("Monerium profile and token schemas", () => {
  test("accept documented responses with unknown fields", () => {
    expect(
      moneriumAccessTokenResponseSchema.safeParse({
        access_token: "access-token",
        expires_in: 3600,
        scope: "openid",
        token_type: "Bearer"
      }).success
    ).toBe(true);
    expect(moneriumProfileSchema.safeParse(profile()).success).toBe(true);
  });

  test("reject missing compliance state and unknown provider enums", () => {
    const missingDetails = profile();
    delete (missingDetails as Record<string, unknown>).details;
    expect(moneriumProfileSchema.safeParse(missingDetails).success).toBe(false);
    expect(moneriumProfileSchema.safeParse({ ...profile(), state: "suspended" }).success).toBe(false);
  });
});

describe("Monerium address and IBAN schemas", () => {
  test("accepts combined off-chain EIP-1271 signature bytes as opaque hex", () => {
    const combinedSignature = `0x${"12".repeat(130)}`;
    expect(
      moneriumLinkAddressRequestSchema.safeParse({
        address: ADDRESS,
        chain: "ethereum",
        message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
        profile: PROFILE_ID,
        signature: combinedSignature
      }).success
    ).toBe(true);
  });

  test("accepts the on-chain EIP-1271 marker but rejects altered messages and odd hex", () => {
    const base = {
      address: ADDRESS,
      chain: "ethereum",
      message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
      profile: PROFILE_ID,
      signature: "0x"
    };
    expect(moneriumLinkAddressRequestSchema.safeParse(base).success).toBe(true);
    expect(moneriumLinkAddressRequestSchema.safeParse({ ...base, message: `${base.message} ` }).success).toBe(false);
    expect(moneriumLinkAddressRequestSchema.safeParse({ ...base, signature: "0x123" }).success).toBe(false);
  });

  test("validates linked address and IBAN response identifiers", () => {
    expect(moneriumAddressSchema.safeParse({ address: ADDRESS, chains: ["ethereum"], profile: PROFILE_ID }).success).toBe(
      true
    );
    expect(
      moneriumIbanSchema.safeParse({
        address: ADDRESS,
        bic: "CBHFLU2LXXX",
        chain: "ethereum",
        iban: IBAN,
        name: "Jane Doe",
        profile: PROFILE_ID
      }).success
    ).toBe(true);
    expect(moneriumIbanSchema.safeParse({ address: ADDRESS, iban: "not-an-iban" }).success).toBe(false);
  });
});

describe("Monerium order schemas", () => {
  test("pins the exact signed SEPA message and decimal amount representation", () => {
    const request = redeemRequest();
    expect(moneriumRedeemOrderRequestSchema.safeParse(request).success).toBe(true);
    expect(
      moneriumRedeemOrderRequestSchema.safeParse({
        ...request,
        message: request.message.replace(IBAN, `${IBAN.slice(0, 4)}...${IBAN.slice(-4)}`)
      }).success
    ).toBe(true);
    expect(
      moneriumRedeemOrderRequestSchema.safeParse({ ...redeemRequest(), message: `Send EUR 100 to ${IBAN}` }).success
    ).toBe(false);
    expect(moneriumRedeemOrderRequestSchema.safeParse(redeemRequest("100.001")).success).toBe(false);
  });

  test("requires supporting evidence at the EUR 15,000 threshold", () => {
    expect(moneriumRedeemOrderRequestSchema.safeParse(redeemRequest("14999.99")).success).toBe(true);
    expect(moneriumRedeemOrderRequestSchema.safeParse(redeemRequest("15000.00")).success).toBe(false);
    expect(
      moneriumRedeemOrderRequestSchema.safeParse({
        ...redeemRequest("15000.00"),
        supportingDocumentId: RESOURCE_ID
      }).success
    ).toBe(true);
  });

  test("accepts documented order envelopes and rejects provider state drift", () => {
    expect(moneriumListOrdersResponseSchema.safeParse({ orders: [order()] }).success).toBe(true);
    expect(moneriumListOrdersResponseSchema.safeParse({ orders: [{ ...order(), state: "settled" }] }).success).toBe(false);
  });
});

describe("Monerium file and webhook schemas", () => {
  test("validates uploaded-file metadata", () => {
    expect(
      moneriumUploadedFileSchema.safeParse({
        hash: "sha256:abc",
        id: RESOURCE_ID,
        meta: {
          createdAt: "2026-08-25T12:00:00Z",
          updatedAt: "2026-08-25T12:00:00Z",
          uploadedBy: PROFILE_ID
        },
        name: "evidence.pdf",
        size: 1234,
        type: "application/pdf"
      }).success
    ).toBe(true);
  });

  test("requires HTTPS and a 24-64 byte webhook secret", () => {
    const secret = `whsec_${btoa("a".repeat(32))}`;
    expect(moneriumCreateWebhookRequestSchema.safeParse({ secret, url: "https://example.com/monerium" }).success).toBe(
      true
    );
    expect(moneriumCreateWebhookRequestSchema.safeParse({ secret: "whsec_dGlueQ==", url: "http://example.com" }).success).toBe(
      false
    );
  });

  test("accepts partial profile webhook snapshots and rejects unknown event types", () => {
    expect(
      moneriumWebhookEventSchema.safeParse({
        data: { id: PROFILE_ID, kind: "personal", state: "approved" },
        timestamp: "2026-08-25T12:00:00Z",
        type: "profile.updated"
      }).success
    ).toBe(true);
    expect(
      moneriumWebhookEventSchema.safeParse({ timestamp: "2026-08-25T12:00:00Z", type: "profile.deleted" }).success
    ).toBe(false);
  });

  test("accepts the documented partial iban.updated snapshot", () => {
    expect(
      moneriumWebhookEventSchema.safeParse({
        data: {
          address: ADDRESS,
          chain: "ethereum",
          iban: "EE52 1273 8426 8857 1285",
          profile: PROFILE_ID,
          state: "approved"
        },
        timestamp: "2026-08-25T12:00:00Z",
        type: "iban.updated"
      }).success
    ).toBe(true);
  });
});
