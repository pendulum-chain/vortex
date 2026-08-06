import { describe, expect, mock, test } from "bun:test";
import * as forge from "node-forge";
import { BrlaApiService } from "./brlaApiService";
import { Endpoint } from "./mappings";
import { AveniaDocumentType, type AveniaKybLevel1Payload, type AveniaUboPayload } from "./types";

function serviceWithMockedRequest() {
  const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
  const sendRequest = mock(async () => ({ id: "provider-id" }));
  Object.assign(service, { sendRequest });
  return { sendRequest, service };
}

const ubo: AveniaUboPayload = {
  city: "Sao Paulo",
  country: "BRA",
  countryOfTaxId: "BRA",
  dateOfBirth: "1988-07-22",
  documentCountry: "BRA",
  fullName: "UBO NAME",
  hasControl: "CEO",
  percentageOfOwnership: "100",
  state: "SP",
  streetLine1: "Rua Aurora 456",
  taxIdNumber: "11182159111",
  uploadedIdentificationId: "document-1",
  zipCode: "01209-001"
};

const kyb: AveniaKybLevel1Payload = {
  businessActivityDescription: "Software development",
  certificateOfIncorporationDocumentId: "document-2",
  companyCity: "Sao Paulo",
  companyCountry: "BRA",
  companyLegalName: "ACME LTDA",
  companyRegistrationNumber: "42731085000167",
  companyState: "SP",
  companyStreetLine1: "Av Paulista 1000",
  companyZipCode: "01310-100",
  countryTaxResidence: "BRA",
  estimatedAnnualRevenueUsd: "less_than_100k",
  estimatedMonthlyVolumeUsd: "2000",
  numberOfEmployees: "1-10",
  reasonForAccountOpening: "receive_payments_for_goods_and_services",
  sourceOfFundsAndIncome: "sales_of_goods_and_services",
  taxIdentificationDocumentId: "document-3",
  taxIdentificationNumberTin: "42.731.085/0001-67",
  uboIds: ["ubo-1"]
};

describe("BrlaApiService Avenia KYB Level 1 mappings", () => {
  test("substitutes and encodes provider path parameters before signing the request", async () => {
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    const keyPair = forge.pki.rsa.generateKeyPair(1024);
    Object.assign(service, { apiKey: "test-key", privateKey: forge.pki.privateKeyToPem(keyPair.privateKey) });
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => new Response(JSON.stringify({ attempt: {} }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      await service.sendRequest(Endpoint.GetKybAttempt, "GET", "subAccountId=sub-1", undefined, "attempt/1");
      expect(String(fetchMock.mock.calls[0][0])).toEndWith(
        "/v2/kyc/attempts/attempt%2F1?subAccountId=sub-1"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("maps document readiness and UBO creation to subaccount-scoped endpoints", async () => {
    const { sendRequest, service } = serviceWithMockedRequest();

    await service.getUploadedDocument("document/1", "sub account");
    await service.createUbo(ubo, "sub account");

    expect(sendRequest.mock.calls[0]).toEqual([
      Endpoint.GetDocument,
      "GET",
      "subAccountId=sub%20account",
      undefined,
      "document/1"
    ]);
    expect(sendRequest.mock.calls[1]).toEqual([Endpoint.Ubos, "POST", "subAccountId=sub%20account", ubo]);
  });

  test("maps API KYB submission and subaccount-scoped attempt polling", async () => {
    const { sendRequest, service } = serviceWithMockedRequest();

    await service.submitKybLevel1(kyb, "sub-1");
    await service.getKybAttemptStatus("attempt-1", "sub-1");

    expect(sendRequest.mock.calls[0]).toEqual([Endpoint.Level1Api, "POST", "subAccountId=sub-1", kyb]);
    expect(sendRequest.mock.calls[1]).toEqual([
      Endpoint.GetKybAttempt,
      "GET",
      "subAccountId=sub-1",
      undefined,
      "attempt-1"
    ]);
  });

  test("includes the corporate and UBO identification document types", () => {
    expect(AveniaDocumentType.CERTIFICATE_OF_INCORPORATION).toBe("CERTIFICATE-OF-INCORPORATION");
    expect(AveniaDocumentType.COMPANY_TAX_IDENTIFICATION_DOCUMENT).toBe("COMPANY-TAX-IDENTIFICATION-DOCUMENT");
    expect(AveniaDocumentType.RESIDENCE_PERMIT).toBe("RESIDENCE-PERMIT");
  });
});
