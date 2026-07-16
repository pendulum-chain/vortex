import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  AlfredPayCountry,
  AlfredPayStatus,
  AlfredpayApiService,
  AlfredpayCustomerType,
  AlfredpayKycStatus
} from "@vortexfi/shared";
import { createAlfredpayCustomer } from "../api/services/alfredpay/alfredpay-customer.service";
import KycCase from "../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";
import { type FakeSupabaseAuth, installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../test-utils/test-app";

// Regression suite for the stuck-KYB deadlock: a submission left PENDING at Alfredpay (finalize
// failed or data was invalid) kept our status on `started` forever, and re-filing the form POSTed a
// new submission Alfredpay refuses while one is pending. PENDING now maps to our `pending`, the
// latest submission id is persisted on the kyc_case, and re-submitting updates the pending
// submission in place (PUT …/customers/kyb).

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

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const KYB_FORM = {
  address: "Calle 1 # 2-3",
  businessName: "Prueba SAS",
  city: "Bogota",
  country: "CO",
  relatedPersons: [
    {
      dateOfBirth: "1990-01-01",
      email: "rep@example.com",
      firstName: "Ana",
      lastName: "Rep",
      nationalities: ["CO"]
    }
  ],
  state: "DC",
  taxId: "900123456",
  website: "https://prueba.example.com",
  zipCode: "110111"
};

async function createBusinessCustomer(email: string) {
  const user = await createTestUser({ email });
  const token = testUserToken(user.id, email);
  await createAlfredpayCustomer(user.id, {
    alfredPayId: "ap-kyb-pending",
    country: AlfredPayCountry.CO,
    status: AlfredPayStatus.Consulted,
    type: AlfredpayCustomerType.BUSINESS
  });
  return { token, user };
}

describe("Alfredpay KYB PENDING submission", () => {
  it("surfaces a provider-PENDING submission as pending with the submission id on the kyc case", async () => {
    const { token } = await createBusinessCustomer("kyb-pending-status@example.com");

    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => ({ submissionId: "kyb-sub-1" }))
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entities: Array<{ accounts: Array<{ provider: string; state: string }> }> };
    const account = body.entities.flatMap(entity => entity.accounts).find(item => item.provider === "alfredpay");
    expect(account?.state).toBe("pending");

    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    expect(customer?.status).toBe(VerificationStatus.Pending);
    expect(customer?.statusExternal).toBe("PENDING");
    const kycCase = await KycCase.findOne({ where: { providerCustomerId: customer?.id } });
    expect(kycCase?.providerCaseId).toBe("kyb-sub-1");
  });

  it("updates the pending submission in place instead of POSTing a new one on re-submit", async () => {
    const { token } = await createBusinessCustomer("kyb-pending-resubmit@example.com");

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    const submitKybInformation = mock(async () => ({ submissionId: "should-not-be-created" }));
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => ({ submissionId: "kyb-sub-1" })),
          submitKybInformation,
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissionId: "kyb-sub-1" });

    expect(updateKybInformation).toHaveBeenCalledTimes(1);
    expect(updateKybInformation.mock.calls[0]).toEqual(["ap-kyb-pending", "kyb-sub-1", KYB_FORM]);
    expect(submitKybInformation).not.toHaveBeenCalled();

    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    const kycCase = await KycCase.findOne({ where: { providerCustomerId: customer?.id } });
    expect(kycCase?.providerCaseId).toBe("kyb-sub-1");
  });

  it("resolves the submission id from the KYB details when the last-submission response omits it", async () => {
    const { token } = await createBusinessCustomer("kyb-details-fallback@example.com");

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    const submitKybInformation = mock(async () => ({ submissionId: "should-not-be-created" }));
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybBusinessDetails: mock(async () => [{ relatedPersons: [], submissionId: "kyb-sub-1" }]),
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          // Sandbox-observed: the dedicated last-submission endpoint answers without a submissionId.
          getLastKybSubmission: mock(async () => ({})),
          submitKybInformation,
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissionId: "kyb-sub-1" });
    expect(updateKybInformation).toHaveBeenCalledTimes(1);
    expect(submitKybInformation).not.toHaveBeenCalled();
  });

  it("recovers from 'Customer KYB already exists' by updating the existing submission", async () => {
    const { token } = await createBusinessCustomer("kyb-already-exists@example.com");

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    let statusCalls = 0;
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybBusinessDetails: mock(async () => [{ relatedPersons: [], submissionId: "kyb-sub-1" }]),
          // The pre-submit status probe fails, so the controller attempts a fresh POST first.
          getKybStatus: mock(async () => {
            statusCalls += 1;
            if (statusCalls === 1) throw new Error("Request failed with status '500'. Error: sandbox hiccup");
            return { status: AlfredpayKycStatus.PENDING };
          }),
          getLastKybSubmission: mock(async () => ({})),
          submitKybInformation: mock(async () => {
            throw new Error(
              'Request failed with status \'400\'. Error: {"errorCode":111405,"errorMessage":"Customer KYB already exists"}'
            );
          }),
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissionId: "kyb-sub-1" });
    expect(updateKybInformation).toHaveBeenCalledTimes(1);
    expect(updateKybInformation.mock.calls[0]).toEqual(["ap-kyb-pending", "kyb-sub-1", KYB_FORM]);

    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    const kycCase = await KycCase.findOne({ where: { providerCustomerId: customer?.id } });
    expect(kycCase?.providerCaseId).toBe("kyb-sub-1");
  });

  it("does not update an existing KYB unless Alfredpay confirms it is editable", async () => {
    const { token } = await createBusinessCustomer("kyb-already-completed@example.com");

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    let statusCalls = 0;
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybStatus: mock(async () => {
            statusCalls += 1;
            if (statusCalls === 1) throw new Error("Request failed with status '500'. Error: sandbox hiccup");
            return { status: AlfredpayKycStatus.COMPLETED };
          }),
          getLastKybSubmission: mock(async () => ({ submissionId: "kyb-sub-1" })),
          submitKybInformation: mock(async () => {
            throw new Error(
              'Request failed with status \'400\'. Error: {"errorCode":111405,"errorMessage":"Customer KYB already exists"}'
            );
          }),
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });

    expect(response.status).toBe(409);
    expect(updateKybInformation).not.toHaveBeenCalled();
  });

  it("prefers a persisted submission id when Alfredpay still returns it", async () => {
    const { token } = await createBusinessCustomer("kyb-persisted-current@example.com");
    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    await KycCase.update({ providerCaseId: "kyb-sub-persisted" }, { where: { providerCustomerId: customer?.id } });

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybBusinessDetails: mock(async () => [
            { relatedPersons: [], submissionId: "kyb-sub-first" },
            { relatedPersons: [], submissionId: "kyb-sub-persisted" }
          ]),
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => ({})),
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(updateKybInformation.mock.calls[0]?.[1]).toBe("kyb-sub-persisted");
  });

  it("falls back to Alfredpay's first submission when the persisted id is stale", async () => {
    const { token } = await createBusinessCustomer("kyb-persisted-stale@example.com");
    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    await KycCase.update({ providerCaseId: "kyb-sub-stale" }, { where: { providerCustomerId: customer?.id } });

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybBusinessDetails: mock(async () => [
            { relatedPersons: [], submissionId: "kyb-sub-first" },
            { relatedPersons: [], submissionId: "kyb-sub-second" }
          ]),
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => ({})),
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(updateKybInformation.mock.calls[0]?.[1]).toBe("kyb-sub-first");
  });

  it("uses the persisted submission id when Alfredpay discovery is unavailable", async () => {
    const { token } = await createBusinessCustomer("kyb-persisted-recovery@example.com");
    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    await KycCase.update({ providerCaseId: "kyb-sub-persisted" }, { where: { providerCustomerId: customer?.id } });

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybBusinessDetails: mock(async () => {
            throw new Error("details unavailable");
          }),
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => {
            throw new Error("last submission unavailable");
          }),
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(updateKybInformation.mock.calls[0]?.[1]).toBe("kyb-sub-persisted");
  });

  it("surfaces a failing in-place update instead of falling through to a fresh POST", async () => {
    const { token } = await createBusinessCustomer("kyb-put-fails@example.com");

    const submitKybInformation = mock(async (_customerId: string, _data: unknown) => ({ submissionId: "kyb-sub-new" }));
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => ({ submissionId: "kyb-sub-1" })),
          submitKybInformation,
          updateKybInformation: mock(async () => {
            throw new Error("invalid related person data");
          })
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });

    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toContain("invalid related person data");
    expect(submitKybInformation).not.toHaveBeenCalled();
  });

  // Sandbox-observed: the last-submission endpoint can answer `{}` (success without a submissionId)
  // even while a submission exists — an empty answer must not discard the persisted recovery id.
  it("uses the persisted submission id when last-submission answers empty and the details lookup fails", async () => {
    const { token } = await createBusinessCustomer("kyb-persisted-empty-last@example.com");
    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    await KycCase.update({ providerCaseId: "kyb-sub-persisted" }, { where: { providerCustomerId: customer?.id } });

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybBusinessDetails: mock(async () => {
            throw new Error("details unavailable");
          }),
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => ({})),
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(updateKybInformation.mock.calls[0]?.[1]).toBe("kyb-sub-persisted");
  });

  it("getKycStatus flips a stale started row to pending via the details fallback", async () => {
    const { token } = await createBusinessCustomer("kyb-status-refresh@example.com");

    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybBusinessDetails: mock(async () => [{ relatedPersons: [], submissionId: "kyb-sub-1" }]),
          getKybStatus: mock(async () => ({ status: AlfredpayKycStatus.PENDING })),
          getLastKybSubmission: mock(async () => ({}))
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/getKycStatus?country=CO&type=BUSINESS", {
      headers: authHeaders(token)
    });
    expect(response.status).toBe(200);

    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    expect(customer?.status).toBe(VerificationStatus.Pending);
    expect(customer?.statusExternal).toBe("PENDING");
    const kycCase = await KycCase.findOne({ where: { providerCustomerId: customer?.id } });
    expect(kycCase?.providerCaseId).toBe("kyb-sub-1");
  });

  // Sandbox-observed: the KYB status endpoint reports lowercase "pending".
  it("normalizes a lowercase provider status: getKycStatus maps it to pending and stores it uppercased", async () => {
    const { token } = await createBusinessCustomer("kyb-lowercase-status@example.com");

    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybStatus: mock(async () => ({ status: "pending" })),
          getLastKybSubmission: mock(async () => ({ submissionId: "kyb-sub-1" }))
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/getKycStatus?country=CO&type=BUSINESS", {
      headers: authHeaders(token)
    });
    expect(response.status).toBe(200);

    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    expect(customer?.status).toBe(VerificationStatus.Pending);
    expect(customer?.statusExternal).toBe("PENDING");
  });

  it("normalizes a lowercase provider status: re-submit updates the pending submission in place", async () => {
    const { token } = await createBusinessCustomer("kyb-lowercase-resubmit@example.com");

    const updateKybInformation = mock(async (_customerId: string, _submissionId: string, _data: unknown) => undefined);
    const submitKybInformation = mock(async () => ({ submissionId: "should-not-be-created" }));
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKybStatus: mock(async () => ({ status: "pending" })),
          getLastKybSubmission: mock(async () => ({ submissionId: "kyb-sub-1" })),
          submitKybInformation,
          updateKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissionId: "kyb-sub-1" });
    expect(updateKybInformation).toHaveBeenCalledTimes(1);
    expect(submitKybInformation).not.toHaveBeenCalled();
  });

  it("still creates a fresh submission when none exists", async () => {
    const { token } = await createBusinessCustomer("kyb-fresh-submit@example.com");

    const submitKybInformation = mock(async () => ({ submissionId: "kyb-sub-new" }));
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getLastKybSubmission: mock(async () => {
            throw new Error("Request failed with status '404'. Error: no submission");
          }),
          submitKybInformation
        }) as unknown as AlfredpayApiService
    );

    const response = await api.request("/v1/alfredpay/submitKybInformation", {
      body: JSON.stringify(KYB_FORM),
      headers: authHeaders(token),
      method: "POST"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissionId: "kyb-sub-new" });
    expect(submitKybInformation).toHaveBeenCalledTimes(1);

    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "ap-kyb-pending" } });
    const kycCase = await KycCase.findOne({ where: { providerCustomerId: customer?.id } });
    expect(kycCase?.providerCaseId).toBe("kyb-sub-new");
  });
});
