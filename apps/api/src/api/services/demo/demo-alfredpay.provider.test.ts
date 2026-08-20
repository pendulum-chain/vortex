import {
  AlfredpayApiService,
  DomesticCustomerType,
  AlfredpayKybStatus,
  type GetAllConfigsResponse,
  type SubmitKybInformationRequest
} from "@vortexfi/shared";
import { describe, expect, it } from "bun:test";
import { config } from "../../../config/vars";
import { createDemoAlfredpayService, installDemoProviders } from "./demo-alfredpay.provider";

const REAL_CONFIGS: GetAllConfigsResponse = { supportedPairs: [] };

function fakeRealClient(): AlfredpayApiService {
  return { getAllConfigs: async () => REAL_CONFIGS } as unknown as AlfredpayApiService;
}

const KYB_SUBMISSION = {
  address: "Calle 1",
  businessName: "Demo Corp",
  city: "Bogotá",
  country: "CO",
  relatedPersons: [{ firstName: "Ana", lastName: "Gómez" }],
  state: "Cundinamarca",
  taxId: "900123456",
  website: "https://demo.example",
  zipCode: "110111"
} as unknown as SubmitKybInformationRequest;

describe("demo alfredpay provider", () => {
  it("moves a submission from pending to in review once it is sent", async () => {
    const service = createDemoAlfredpayService(fakeRealClient);
    const customerId = (await service.createCustomer("demo@example.com", DomesticCustomerType.BUSINESS, "CO")).customerId;

    const { submissionId } = await service.submitKybInformation(customerId, KYB_SUBMISSION);
    expect((await service.getKybStatus(customerId, submissionId)).status).toBe(AlfredpayKybStatus.PENDING);

    await service.sendKybSubmission(customerId, submissionId);
    expect((await service.getKybStatus(customerId, submissionId)).status).toBe(AlfredpayKybStatus.IN_REVIEW);
  });

  // The whole point of the demo corridor: the same wizard has to be walkable again and again.
  it("accepts a fresh submission after a completed one", async () => {
    const service = createDemoAlfredpayService(fakeRealClient);
    const customerId = (await service.createCustomer("demo@example.com", DomesticCustomerType.BUSINESS, "CO")).customerId;

    const first = await service.submitKybInformation(customerId, KYB_SUBMISSION);
    await service.sendKybSubmission(customerId, first.submissionId);
    const second = await service.submitKybInformation(customerId, KYB_SUBMISSION);

    expect(second.submissionId).not.toBe(first.submissionId);
    expect((await service.getKybStatus(customerId, second.submissionId)).status).toBe(AlfredpayKybStatus.PENDING);
  });

  it("reports no submission for an untouched customer", async () => {
    const service = createDemoAlfredpayService(fakeRealClient);

    await expect(service.getLastKybSubmission("demo-customer-unknown")).rejects.toThrow(/404/);
  });

  it("returns the related-person ids the file uploads need", async () => {
    const service = createDemoAlfredpayService(fakeRealClient);
    const customerId = (await service.createCustomer("demo@example.com", DomesticCustomerType.BUSINESS, "CO")).customerId;
    await service.submitKybInformation(customerId, KYB_SUBMISSION);

    const [details] = await service.getKybBusinessDetails(customerId);

    expect(details.businessName).toBe("Demo Corp");
    expect(details.relatedPersons.map(person => person.idRelatedPerson)).toEqual(["demo-person-1"]);
  });

  it("passes everything it does not fake through to the real client", async () => {
    const service = createDemoAlfredpayService(fakeRealClient);

    expect(await service.getAllConfigs()).toBe(REAL_CONFIGS);
  });

  // Faking individual creation would persist an invented id that every later real-client
  // call (redirect link, KYC status) rejects with confusing provider 404s.
  it("passes individual customer creation through to the real client", async () => {
    const realCalls: string[] = [];
    const real = {
      createCustomer: async (_email: string, type: DomesticCustomerType) => {
        realCalls.push(type);
        return { createdAt: new Date().toISOString(), customerId: "real-customer-1" };
      }
    } as unknown as AlfredpayApiService;
    const service = createDemoAlfredpayService(() => real);

    const individual = await service.createCustomer("demo@example.com", DomesticCustomerType.INDIVIDUAL, "CO");
    const business = await service.createCustomer("demo@example.com", DomesticCustomerType.BUSINESS, "CO");

    expect(individual.customerId).toBe("real-customer-1");
    expect(realCalls).toEqual([DomesticCustomerType.INDIVIDUAL]);
    expect(business.customerId).toMatch(/^demo-customer-/);
  });

  // provider_customers is unique on (provider, provider_customer_id); ids persisted by a
  // previous process must not collide with the ones a restarted stand-in mints.
  it("mints customer ids that stay unique across restarts", async () => {
    const first = createDemoAlfredpayService(fakeRealClient);
    const second = createDemoAlfredpayService(fakeRealClient);

    const a = (await first.createCustomer("demo@example.com", DomesticCustomerType.BUSINESS, "CO")).customerId;
    const b = (await second.createCustomer("demo@example.com", DomesticCustomerType.BUSINESS, "CO")).customerId;

    expect(a).not.toBe(b);
  });

  it("swaps the singleton for the demo stand-in on an opted-in sandbox", async () => {
    const originalGetInstance = AlfredpayApiService.getInstance;
    const originalFlag = config.demoProviderEnabled;
    const originalEnv = config.deploymentEnv;

    try {
      config.deploymentEnv = "sandbox";
      config.demoProviderEnabled = true;
      installDemoProviders();

      expect(AlfredpayApiService.getInstance).not.toBe(originalGetInstance);
      const service = AlfredpayApiService.getInstance();
      const customer = await service.createCustomer("demo@example.com", DomesticCustomerType.BUSINESS, "CO");
      expect(customer.customerId).toMatch(/^demo-customer-/);
    } finally {
      config.demoProviderEnabled = originalFlag;
      config.deploymentEnv = originalEnv;
      AlfredpayApiService.getInstance = originalGetInstance;
    }
  });

  it("stays uninstalled unless a sandbox deployment opts in", () => {
    const originalGetInstance = AlfredpayApiService.getInstance;
    const originalFlag = config.demoProviderEnabled;
    const originalEnv = config.deploymentEnv;

    try {
      config.deploymentEnv = "production";

      config.demoProviderEnabled = false;
      installDemoProviders();
      expect(AlfredpayApiService.getInstance).toBe(originalGetInstance);

      config.demoProviderEnabled = true;
      expect(() => installDemoProviders()).toThrow(/sandbox-only/);
      expect(AlfredpayApiService.getInstance).toBe(originalGetInstance);
    } finally {
      config.demoProviderEnabled = originalFlag;
      config.deploymentEnv = originalEnv;
      AlfredpayApiService.getInstance = originalGetInstance;
    }
  });
});
