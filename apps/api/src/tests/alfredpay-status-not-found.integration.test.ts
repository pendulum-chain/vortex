import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { AlfredPayStatus, AlfredpayApiError, AlfredpayApiService, DomesticCountry, DomesticCustomerType } from "@vortexfi/shared";
import { createAlfredpayCustomer } from "../api/services/alfredpay/alfredpay-customer.service";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";
import { type FakeSupabaseAuth, installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../test-utils/test-app";

// GET /alfredpayStatus treats an upstream 404 for the customer's submission as a stale local
// status and sends the customer back to onboarding. Alfred's platform migration can answer 404 for
// data it has not moved yet, so that reset must never demote an approved customer.

let api: TestApp;
let fakeAuth: FakeSupabaseAuth;
const realGetInstance = AlfredpayApiService.getInstance;

beforeAll(async () => {
  await setupTestDatabase();
  fakeAuth = installFakeSupabaseAuth();
  api = await startTestApp();
});

afterAll(async () => {
  await api.close();
  fakeAuth.restore();
});

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(() => {
  AlfredpayApiService.getInstance = realGetInstance;
});

function submissionNotFound(): void {
  AlfredpayApiService.getInstance = mock(
    () =>
      ({
        getLastKycSubmission: mock(async () => {
          throw new AlfredpayApiError({
            endpoint: "/api/v1/third-party-service/penny/customers/kyc/ap-not-found",
            method: "GET",
            responseBody: '{"errorCode":111404,"errorMessage":"Not found"}',
            status: 404
          });
        })
      }) as unknown as AlfredpayApiService
  );
}

async function statusAfterNotFound(email: string, stored: AlfredPayStatus) {
  const user = await createTestUser({ email });
  await createAlfredpayCustomer(user.id, {
    alfredPayId: "ap-not-found",
    country: DomesticCountry.MX,
    status: stored,
    type: DomesticCustomerType.INDIVIDUAL
  });
  submissionNotFound();

  const response = await api.request("/v1/alfredpay/alfredpayStatus?country=MX", {
    headers: { Authorization: `Bearer ${testUserToken(user.id, email)}` }
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { status: AlfredPayStatus };
  const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-not-found" } });
  return { customer, reported: body.status };
}

describe("GET /alfredpayStatus when Alfredpay answers 404", () => {
  it("keeps an approved customer approved", async () => {
    const { customer, reported } = await statusAfterNotFound("approved-404@example.com", AlfredPayStatus.Success);

    expect(reported).toBe(AlfredPayStatus.Success);
    expect(customer?.status).toBe(VerificationStatus.Approved);
  });

  it("still resets an unapproved customer so onboarding restarts", async () => {
    const { customer, reported } = await statusAfterNotFound("in-review-404@example.com", AlfredPayStatus.UserCompleted);

    expect(reported).toBe(AlfredPayStatus.Consulted);
    expect(customer?.status).toBe(VerificationStatus.Pending);
  });
});

describe("GET /getKycStatus when Alfredpay reports no submission", () => {
  async function statusWithoutSubmission(email: string, stored: AlfredPayStatus) {
    const user = await createTestUser({ email });
    await createAlfredpayCustomer(user.id, {
      alfredPayId: "ap-not-found",
      country: DomesticCountry.MX,
      status: stored,
      type: DomesticCustomerType.INDIVIDUAL
    });
    AlfredpayApiService.getInstance = mock(
      () => ({ getLastKycSubmission: mock(async () => ({})) }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/getKycStatus?country=MX", {
      headers: { Authorization: `Bearer ${testUserToken(user.id, email)}` }
    });
    expect(response.status).toBe(404);
    return ProviderCustomer.findOne({ where: { providerCustomerId: "ap-not-found" } });
  }

  it("keeps an approved customer approved", async () => {
    const customer = await statusWithoutSubmission("approved-empty@example.com", AlfredPayStatus.Success);
    expect(customer?.status).toBe(VerificationStatus.Approved);
  });

  it("still resets an unapproved customer", async () => {
    const customer = await statusWithoutSubmission("in-review-empty@example.com", AlfredPayStatus.UserCompleted);
    expect(customer?.status).toBe(VerificationStatus.Pending);
  });
});
