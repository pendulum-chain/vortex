import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import ApiCredential from "../models/apiCredential.model";
import ManagedProfile from "../models/managedProfile.model";
import ManagedProfileManager from "../models/managedProfileManager.model";
import ProfilePartnerAssignment from "../models/profilePartnerAssignment.model";
import QuoteTicket from "../models/quoteTicket.model";
import RampState from "../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestApiKey, createTestPartner, createTestTaxId, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { startTestApp, type TestApp } from "../test-utils/test-app";

describe("managed-profile quote and registered-ramp lifecycle", () => {
  let app: TestApp;
  let world: FakeWorld;

  const DESTINATION = "0x7ba99e99bc669b3508aff9cc0a898e869459f877";
  const EPHEMERALS = [
    privateKeyToAccount(`0x${"1".padStart(64, "0")}`).address,
    privateKeyToAccount(`0x${"2".padStart(64, "0")}`).address,
    privateKeyToAccount(`0x${"3".padStart(64, "0")}`).address
  ];

  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    await app?.close();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function jsonRequest(path: string, init: RequestInit): Promise<{ body: Record<string, unknown>; status: number }> {
    const response = await app.request(path, init);
    const text = await response.text();
    return { body: text ? (JSON.parse(text) as Record<string, unknown>) : {}, status: response.status };
  }

  function quoteBody(): string {
    return JSON.stringify({
      from: "pix",
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.Base,
      outputCurrency: EvmToken.BRLA,
      rampType: RampDirection.BUY,
      to: Networks.Base
    });
  }

  it("retains registered child records while enforcing current delegation and owner isolation", async () => {
    const manager = await createTestUser({ email: "managed-lifecycle-manager@example.com" });
    await ManagedProfileManager.create({ allowedCorridors: ["BR"], isActive: true, profileId: manager.id });
    const managerCredential = await createTestApiKey({ userId: manager.id });
    const managerHeaders = { "Content-Type": "application/json", "X-API-Key": managerCredential.plaintextKey };

    const createChild = async (externalSubjectId: string) => {
      const response = await jsonRequest("/v1/managed-profiles", {
        body: JSON.stringify({
          contactEmail: `${externalSubjectId}@example.com`,
          customerType: "individual",
          externalSubjectId
        }),
        headers: managerHeaders,
        method: "POST"
      });
      expect(response.status).toBe(201);
      return (response.body.managedProfile as { profileId: string }).profileId;
    };

    const childId = await createChild("managed-lifecycle-child");
    const siblingId = await createChild("managed-lifecycle-sibling");
    const pricingPartner = await createTestPartner({
      fiatCurrency: FiatToken.BRL,
      markupCurrency: FiatToken.BRL,
      markupType: "absolute",
      markupValue: 5,
      payoutAddressEvm: DESTINATION,
      rampType: RampDirection.BUY
    });
    const managerPricingPartner = await createTestPartner({
      fiatCurrency: FiatToken.BRL,
      markupCurrency: FiatToken.BRL,
      markupType: "absolute",
      markupValue: 2,
      payoutAddressEvm: DESTINATION,
      rampType: RampDirection.BUY
    });
    await ProfilePartnerAssignment.create({
      isActive: true,
      partnerId: managerPricingPartner.id,
      partnerName: managerPricingPartner.name,
      userId: manager.id
    });
    await ProfilePartnerAssignment.create({
      isActive: true,
      partnerId: pricingPartner.id,
      partnerName: pricingPartner.name,
      userId: childId
    });
    await createTestTaxId(childId, { subAccountId: "managed-lifecycle-child", taxId: "12345678901" });
    await createTestTaxId(siblingId, { subAccountId: "managed-lifecycle-sibling", taxId: "12345678902" });

    const createCredential = async (profileId: string, name: string) => {
      const response = await jsonRequest(`/v1/managed-profiles/${profileId}/api-credentials`, {
        body: JSON.stringify({ name }),
        headers: managerHeaders,
        method: "POST"
      });
      expect(response.status).toBe(201);
      return response.body as { id: string; secretKey: string };
    };

    const childCredential = await createCredential(childId, "child primary");
    const childSecondCredential = await createCredential(childId, "child secondary");
    const siblingCredential = await createCredential(siblingId, "sibling primary");
    const delegatedHeaders = { ...managerHeaders, "X-Managed-Profile-Id": childId };

    const delegatedOnboarding = await jsonRequest("/v1/onboarding/status", {
      headers: delegatedHeaders,
      method: "GET"
    });
    const directOnboarding = await jsonRequest("/v1/onboarding/status", {
      headers: { "X-API-Key": childCredential.secretKey },
      method: "GET"
    });
    for (const response of [delegatedOnboarding, directOnboarding]) {
      expect(response.status).toBe(200);
      const accounts = (response.body.entities as Array<{ accounts: Array<{ provider: string }> }>).flatMap(
        entity => entity.accounts
      );
      expect(accounts.map(account => account.provider)).toEqual(["avenia"]);
    }

    const directRemainingLimit = await jsonRequest("/v1/brla/getUserRemainingLimit?direction=BUY", {
      headers: { "X-API-Key": childCredential.secretKey },
      method: "GET"
    });
    expect(directRemainingLimit.status).toBe(200);
    expect(directRemainingLimit.body.remainingLimit).toBeDefined();

    const createQuote = async (headers: Record<string, string>) => {
      const response = await jsonRequest("/v1/quotes", { body: quoteBody(), headers, method: "POST" });
      expect(response.status).toBe(201);
      return response.body;
    };
    const registerQuote = async (quoteId: string, secretKey: string, ephemeralAddress: string, managedProfileId?: string) =>
      jsonRequest("/v1/ramp/register", {
        body: JSON.stringify({
          additionalData: { destinationAddress: DESTINATION, taxId: "12345678901" },
          quoteId,
          signingAccounts: [{ address: ephemeralAddress, type: "EVM" }]
        }),
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": secretKey,
          ...(managedProfileId ? { "X-Managed-Profile-Id": managedProfileId } : {})
        },
        method: "POST"
      });

    const delegatedQuoteResponse = await createQuote(delegatedHeaders);
    const delegatedQuoteId = delegatedQuoteResponse.id as string;
    const delegatedQuote = await QuoteTicket.findByPk(delegatedQuoteId);
    expect(delegatedQuote?.userId).toBe(childId);
    expect(delegatedQuote?.partnerId).toBeNull();
    expect(delegatedQuote?.pricingPartnerId).toBe(pricingPartner.id);
    expect(delegatedQuote?.apiCredentialId).toBe(managerCredential.record.id);
    expect(Number(delegatedQuote?.outputAmount)).toBe(99.9);
    expect(Number(delegatedQuoteResponse.partnerFeeFiat)).toBe(5);
    expect(Number(delegatedQuoteResponse.partnerFeeUsd)).toBe(1);
    expect(Number(delegatedQuoteResponse.outputAmount)).toBe(99.9);
    expect(Number(delegatedQuoteResponse.totalFeeFiat)).toBe(5.1);
    expect(Number(delegatedQuote?.outputAmount) / Number(delegatedQuote?.inputAmount)).toBeCloseTo(0.999, 8);

    const directQuoteResponse = await createQuote({
      "Content-Type": "application/json",
      "X-API-Key": childCredential.secretKey
    });
    const directQuoteId = directQuoteResponse.id as string;
    const directQuote = await QuoteTicket.findByPk(directQuoteId);
    expect(directQuote?.userId).toBe(childId);
    expect(directQuote?.partnerId).toBeNull();
    expect(directQuote?.pricingPartnerId).toBe(pricingPartner.id);
    expect(directQuote?.apiCredentialId).toBe(childCredential.id);
    expect(Number(directQuoteResponse.partnerFeeFiat)).toBe(5);
    expect(Number(directQuoteResponse.outputAmount)).toBe(99.9);

    const delegatedSiblingQuoteResponse = await createQuote({
      ...managerHeaders,
      "X-Managed-Profile-Id": siblingId
    });
    const delegatedSiblingQuote = await QuoteTicket.findByPk(delegatedSiblingQuoteResponse.id as string);
    expect(delegatedSiblingQuote?.userId).toBe(siblingId);
    expect(delegatedSiblingQuote?.partnerId).toBeNull();
    expect(delegatedSiblingQuote?.pricingPartnerId).toBe(managerPricingPartner.id);
    expect(delegatedSiblingQuote?.apiCredentialId).toBe(managerCredential.record.id);
    expect(Number(delegatedSiblingQuoteResponse.partnerFeeFiat)).toBe(2);

    const pendingQuoteResponse = await createQuote({
      "Content-Type": "application/json",
      "X-API-Key": childCredential.secretKey
    });
    const pendingQuoteId = pendingQuoteResponse.id as string;
    const mismatchedRegistration = await registerQuote(
      pendingQuoteId,
      childSecondCredential.secretKey,
      EPHEMERALS[2]
    );
    expect(mismatchedRegistration.status).toBe(403);
    expect(JSON.stringify(mismatchedRegistration.body)).toContain(
      "Secret credential does not match the credential used to create this quote"
    );
    expect((await QuoteTicket.findByPk(pendingQuoteId))?.status).toBe("pending");

    const delegatedRegistration = await registerQuote(
      delegatedQuoteId,
      managerCredential.plaintextKey,
      EPHEMERALS[0],
      childId
    );
    expect(delegatedRegistration.status).toBe(201);
    const delegatedRampId = delegatedRegistration.body.id as string;

    const directRegistration = await registerQuote(directQuoteId, childCredential.secretKey, EPHEMERALS[1]);
    expect(directRegistration.status).toBe(201);
    const directRampId = directRegistration.body.id as string;

    const siblingQuoteResponse = await createQuote({
      "Content-Type": "application/json",
      "X-API-Key": siblingCredential.secretKey
    });
    const siblingQuoteId = siblingQuoteResponse.id as string;
    const siblingQuote = await QuoteTicket.findByPk(siblingQuoteId);
    expect(siblingQuote?.userId).toBe(siblingId);
    expect(siblingQuote?.partnerId).toBeNull();
    expect(siblingQuote?.pricingPartnerId).toBe(managerPricingPartner.id);
    expect(siblingQuote?.apiCredentialId).toBe(siblingCredential.id);
    expect(Number(siblingQuoteResponse.partnerFeeFiat)).toBe(2);
    const siblingRegistration = await jsonRequest("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { destinationAddress: DESTINATION, taxId: "12345678902" },
        quoteId: siblingQuoteId,
        signingAccounts: [{ address: EPHEMERALS[2], type: "EVM" }]
      }),
      headers: { "Content-Type": "application/json", "X-API-Key": siblingCredential.secretKey },
      method: "POST"
    });
    expect(siblingRegistration.status).toBe(201);
    const siblingRampId = siblingRegistration.body.id as string;

    const delegatedRamp = await RampState.findByPk(delegatedRampId);
    const directRamp = await RampState.findByPk(directRampId);
    expect(delegatedRamp?.quoteId).toBe(delegatedQuoteId);
    expect(delegatedRamp?.userId).toBe(childId);
    expect(directRamp?.quoteId).toBe(directQuoteId);
    expect(directRamp?.userId).toBe(childId);
    expect((await QuoteTicket.findByPk(delegatedQuoteId))?.status).toBe("consumed");
    expect((await QuoteTicket.findByPk(directQuoteId))?.status).toBe("consumed");

    const siblingStatus = await app.request(`/v1/ramp/${siblingRampId}`, {
      headers: { "X-API-Key": childCredential.secretKey }
    });
    expect(siblingStatus.status).toBe(403);
    const childStatusViaSibling = await app.request(`/v1/ramp/${delegatedRampId}`, {
      headers: { "X-API-Key": siblingCredential.secretKey }
    });
    expect(childStatusViaSibling.status).toBe(403);
    const managerStatus = await app.request(`/v1/ramp/${delegatedRampId}`, {
      headers: { "X-API-Key": managerCredential.plaintextKey }
    });
    expect(managerStatus.status).toBe(403);

    const delegatedHistory = await jsonRequest("/v1/ramp/history", { headers: delegatedHeaders, method: "GET" });
    const directHistory = await jsonRequest("/v1/ramp/history", {
      headers: { "X-API-Key": childCredential.secretKey },
      method: "GET"
    });
    const siblingHistory = await jsonRequest("/v1/ramp/history", {
      headers: { "X-API-Key": siblingCredential.secretKey },
      method: "GET"
    });
    const childRampIds = [delegatedRampId, directRampId].sort();
    expect(delegatedHistory.status).toBe(200);
    expect((delegatedHistory.body.transactions as Array<{ id: string }>).map(({ id }) => id).sort()).toEqual(childRampIds);
    expect(directHistory.status).toBe(200);
    expect((directHistory.body.transactions as Array<{ id: string }>).map(({ id }) => id).sort()).toEqual(childRampIds);
    expect(siblingHistory.status).toBe(200);
    expect((siblingHistory.body.transactions as Array<{ id: string }>).map(({ id }) => id)).toEqual([siblingRampId]);

    const updateBeforeNarrowing = await jsonRequest("/v1/ramp/update", {
      body: JSON.stringify({ rampId: delegatedRampId }),
      headers: delegatedHeaders,
      method: "POST"
    });
    expect(updateBeforeNarrowing.status).toBe(400);
    expect(JSON.stringify(updateBeforeNarrowing.body)).toContain("Missing required fields");
    const startBeforeNarrowing = await jsonRequest("/v1/ramp/start", {
      body: JSON.stringify({ rampId: delegatedRampId }),
      headers: delegatedHeaders,
      method: "POST"
    });
    expect(startBeforeNarrowing.status).toBe(400);
    expect(JSON.stringify(startBeforeNarrowing.body)).toContain("No presigned transactions found");

    await ManagedProfileManager.update({ allowedCorridors: [] }, { where: { profileId: manager.id } });
    const updateAfterNarrowing = await jsonRequest("/v1/ramp/update", {
      body: JSON.stringify({ rampId: delegatedRampId }),
      headers: delegatedHeaders,
      method: "POST"
    });
    expect(updateAfterNarrowing.status).toBe(403);
    expect((updateAfterNarrowing.body.error as { code: string }).code).toBe("MANAGED_PROFILE_ACCESS_DENIED");
    const startAfterNarrowing = await jsonRequest("/v1/ramp/start", {
      body: JSON.stringify({ rampId: delegatedRampId }),
      headers: { "Content-Type": "application/json", "X-API-Key": childCredential.secretKey },
      method: "POST"
    });
    expect(startAfterNarrowing.status).toBe(403);
    expect((startAfterNarrowing.body.error as { code: string }).code).toBe("MANAGED_PROFILE_ACCESS_DENIED");
    expect((await RampState.findByPk(delegatedRampId))?.currentPhase).toBe("initial");

    const deletion = await app.request(`/v1/managed-profiles/${childId}`, {
      headers: managerHeaders,
      method: "DELETE"
    });
    expect(deletion.status).toBe(204);

    const retainedRelationship = await ManagedProfile.findOne({
      where: { managerProfileId: manager.id, profileId: childId }
    });
    const retainedDelegatedQuote = await QuoteTicket.findByPk(delegatedQuoteId);
    const retainedDirectQuote = await QuoteTicket.findByPk(directQuoteId);
    const retainedPendingQuote = await QuoteTicket.findByPk(pendingQuoteId);
    const retainedDelegatedRamp = await RampState.findByPk(delegatedRampId);
    const retainedDirectRamp = await RampState.findByPk(directRampId);
    const retainedChildCredential = await ApiCredential.findByPk(childCredential.id);
    const retainedSecondCredential = await ApiCredential.findByPk(childSecondCredential.id);
    const retainedSiblingCredential = await ApiCredential.findByPk(siblingCredential.id);
    expect(retainedRelationship?.status).toBe("deleted");
    expect(retainedRelationship?.deletedAt).not.toBeNull();
    expect(retainedChildCredential?.revokedAt).not.toBeNull();
    expect(retainedSecondCredential?.revokedAt).not.toBeNull();
    expect(retainedSiblingCredential?.revokedAt).toBeNull();
    expect((await ApiCredential.findByPk(managerCredential.record.id))?.revokedAt).toBeNull();
    expect(retainedDelegatedQuote?.status).toBe("consumed");
    expect(retainedDelegatedQuote?.userId).toBe(childId);
    expect(retainedDelegatedQuote?.apiCredentialId).toBe(managerCredential.record.id);
    expect(retainedDirectQuote?.status).toBe("consumed");
    expect(retainedDirectQuote?.userId).toBe(childId);
    expect(retainedDirectQuote?.apiCredentialId).toBe(childCredential.id);
    expect(retainedPendingQuote?.status).toBe("pending");
    expect(retainedPendingQuote?.userId).toBe(childId);
    expect(retainedPendingQuote?.apiCredentialId).toBe(childCredential.id);
    expect(retainedDelegatedRamp?.userId).toBe(childId);
    expect(retainedDelegatedRamp?.quoteId).toBe(delegatedQuoteId);
    expect(retainedDelegatedRamp?.currentPhase).toBe("initial");
    expect(retainedDelegatedRamp?.phaseHistory.map(entry => entry.phase)).toEqual(["initial"]);
    expect(retainedDirectRamp?.userId).toBe(childId);
    expect(retainedDirectRamp?.quoteId).toBe(directQuoteId);

    const deletedDelegationHistory = await jsonRequest("/v1/ramp/history", {
      headers: delegatedHeaders,
      method: "GET"
    });
    expect(deletedDelegationHistory.status).toBe(403);
    expect((deletedDelegationHistory.body.error as { code: string }).code).toBe("MANAGED_PROFILE_ACCESS_DENIED");
    const revokedChildHistory = await app.request("/v1/ramp/history", {
      headers: { "X-API-Key": childCredential.secretKey },
      method: "GET"
    });
    expect(revokedChildHistory.status).toBe(401);
  });
});
