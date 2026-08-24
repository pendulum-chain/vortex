import { afterEach, describe, expect, it, mock, test } from "bun:test";
import { generateKeyPairSync } from "crypto";
import * as forge from "node-forge";
import logger from "../../logger";
import { BrlaApiError, BrlaApiService } from "./brlaApiService";
import { Endpoint } from "./mappings";
import {
  BrDocumentType,
  type BrKybLevel1Payload,
  type BrUboPayload,
  type KycLevel1Payload
} from "./types";

const realFetch = globalThis.fetch;
const realLogger = logger.current;

afterEach(() => {
  globalThis.fetch = realFetch;
  logger.current = realLogger;
});

function serviceWithMockedRequest() {
  const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
  const sendRequest = mock(async (endpoint: Endpoint) => {
    if (endpoint === Endpoint.GetDocument) {
      return {
        document: {
          documentType: BrDocumentType.PASSPORT,
          id: "document/1",
          ready: true,
          uploadStatusFront: "PROCESSED"
        }
      };
    }
    if (endpoint === Endpoint.GetKybAttempt) {
      return {
        attempt: {
          createdAt: "2026-08-06T12:00:00.000Z",
          id: "attempt-1",
          levelName: "kyb-level-1",
          resultMessage: "",
          retryable: false,
          status: "PENDING",
          updatedAt: "2026-08-06T12:00:00.000Z"
        }
      };
    }
    return { id: "provider-id" };
  });
  Object.assign(service, { sendRequest });
  return { sendRequest, service };
}

const ubo: BrUboPayload = {
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

const kyb: BrKybLevel1Payload = {
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
  test("accepts the hosted-liveness response without an upload URL", async () => {
    const response = {
      id: "liveness-document-1",
      livenessUrl: "https://app.avenia.io/liveness/session-1",
      sessionId: "session-1",
      validateLivenessToken: "liveness-token"
    };
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    const sendRequest = mock(async () => response);
    Object.assign(service, { sendRequest });

    await expect(
      service.getDocumentUploadUrls(BrDocumentType.SELFIE_FROM_LIVENESS, false, "sub-1")
    ).resolves.toEqual(response);
    expect(sendRequest).toHaveBeenCalledWith(
      Endpoint.Documents,
      "POST",
      "subAccountId=sub-1",
      { documentType: BrDocumentType.SELFIE_FROM_LIVENESS, isDoubleSided: false }
    );
  });

  test("still requires an upload URL for an ordinary document", async () => {
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, { sendRequest: mock(async () => ({ id: "document-1" })) });

    await expect(service.getDocumentUploadUrls(BrDocumentType.ID, true, "sub-1")).rejects.toThrow();
  });

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
    expect(sendRequest.mock.calls[1]).toEqual([
      Endpoint.Ubos,
      "POST",
      "subAccountId=sub%20account",
      ubo,
      undefined,
      { sensitiveBody: true }
    ]);
  });

  test("maps API KYB submission and subaccount-scoped attempt polling", async () => {
    const { sendRequest, service } = serviceWithMockedRequest();

    await service.submitKybLevel1(kyb, "sub-1");
    await service.getVerificationAttemptStatus("attempt-1", "sub-1");

    expect(sendRequest.mock.calls[0]).toEqual([
      Endpoint.Level1Api,
      "POST",
      "subAccountId=sub-1",
      kyb,
      undefined,
      { sensitiveBody: true }
    ]);
    expect(sendRequest.mock.calls[1]).toEqual([
      Endpoint.GetKybAttempt,
      "GET",
      "subAccountId=sub-1",
      undefined,
      "attempt-1"
    ]);
  });

  test("includes the corporate and UBO identification document types", () => {
    expect(BrDocumentType.CERTIFICATE_OF_INCORPORATION).toBe("CERTIFICATE-OF-INCORPORATION");
    expect(BrDocumentType.COMPANY_TAX_IDENTIFICATION_DOCUMENT).toBe("COMPANY-TAX-IDENTIFICATION-DOCUMENT");
    expect(BrDocumentType.RESIDENCE_PERMIT).toBe("RESIDENCE-PERMIT");
  });

  test("rejects malformed successful provider responses", async () => {
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, { sendRequest: mock(async () => ({})) });

    await expect(service.submitKybLevel1(kyb, "sub-1")).rejects.toThrow();
  });
});

describe("BrlaApiService.getAveniaPublicKey", () => {
  it("bounds the public-key request with an abort signal", async () => {
    let signal: AbortSignal | null | undefined;
    globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      return new Response(JSON.stringify({ publicKey: "test-public-key" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    });

    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;

    await expect(service.getAveniaPublicKey()).resolves.toBe("test-public-key");
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe("BrlaApiService.importKycToken", () => {
  test("uses the exact trailing-slash URL and signs the sensitive body", async () => {
    const keyPair = forge.pki.rsa.generateKeyPair(1024);
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, { apiKey: "test-key", privateKey: forge.pki.privateKeyToPem(keyPair.privateKey) });
    const fetchMock = mock(async () =>
      new Response(JSON.stringify({ id: "attempt-1", message: "processing KYC" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(service.importKycToken("share-token", "sub/account")).resolves.toEqual({
      id: "attempt-1",
      message: "processing KYC"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestUri = "/v2/kyc/import-token/?subAccountId=sub%2Faccount";
    expect(String(url)).toEndWith(requestUri);
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify({ importToken: "share-token" }));
    const headers = options.headers as Record<string, string>;
    const digest = forge.md.sha256.create();
    digest.update(`${headers["X-API-Timestamp"]}POST${requestUri}${options.body}`, "utf8");
    expect(
      keyPair.publicKey.verify(digest.digest().bytes(), forge.util.decode64(headers["X-API-Signature"]))
    ).toBe(true);
  });

  test("never logs or throws a sensitive token echoed by the provider", async () => {
    const sentinel = "SENTINEL-SUMSUB-TOKEN";
    const sentinelSubaccountId = "SENTINEL-SUBACCOUNT-ID";
    const keyPair = forge.pki.rsa.generateKeyPair(1024);
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, { apiKey: "test-key", privateKey: forge.pki.privateKeyToPem(keyPair.privateKey) });
    const logCalls: Record<"debug" | "error" | "info" | "warn", unknown[][]> = {
      debug: [],
      error: [],
      info: [],
      warn: []
    };
    logger.current = {
      debug: (...args: unknown[]) => logCalls.debug.push(args),
      error: (...args: unknown[]) => logCalls.error.push(args),
      info: (...args: unknown[]) => logCalls.info.push(args),
      warn: (...args: unknown[]) => logCalls.warn.push(args)
    };
    globalThis.fetch = mock(async () => new Response(`invalid token: ${sentinel}`, { status: 400 })) as typeof fetch;

    let thrown: unknown;
    try {
      await service.importKycToken(sentinel, sentinelSubaccountId);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BrlaApiError);
    expect(logCalls.debug).toEqual([
      [`Sending request to ${Endpoint.ImportKycToken} with method POST; sensitive request details omitted`]
    ]);
    for (const calls of Object.values(logCalls)) {
      expect(JSON.stringify(calls)).not.toContain(sentinel);
      expect(JSON.stringify(calls)).not.toContain(sentinelSubaccountId);
    }
    expect(String(thrown)).not.toContain(sentinel);
    expect(JSON.stringify(thrown)).not.toContain(sentinel);
    expect(String(thrown)).not.toContain(sentinelSubaccountId);
    expect(JSON.stringify(thrown)).not.toContain(sentinelSubaccountId);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("BrlaApiService.submitKycLevel1", () => {
  test("never logs or throws a sensitive standard KYC payload echoed by the provider", async () => {
    const sentinel = "SENTINEL-STANDARD-KYC-PII";
    const payload: KycLevel1Payload = {
      city: sentinel,
      country: sentinel,
      countryOfTaxId: sentinel,
      dateOfBirth: sentinel,
      email: sentinel,
      fullName: sentinel,
      state: sentinel,
      streetAddress: sentinel,
      subAccountId: "sub-1",
      taxIdNumber: sentinel,
      uploadedDocumentId: sentinel,
      uploadedSelfieId: sentinel,
      zipCode: sentinel
    };
    const keyPair = forge.pki.rsa.generateKeyPair(1024);
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, { apiKey: "test-key", privateKey: forge.pki.privateKeyToPem(keyPair.privateKey) });
    const logCalls: Record<"debug" | "error" | "info" | "warn", unknown[][]> = {
      debug: [],
      error: [],
      info: [],
      warn: []
    };
    logger.current = {
      debug: (...args: unknown[]) => logCalls.debug.push(args),
      error: (...args: unknown[]) => logCalls.error.push(args),
      info: (...args: unknown[]) => logCalls.info.push(args),
      warn: (...args: unknown[]) => logCalls.warn.push(args)
    };
    globalThis.fetch = mock(async () => new Response(`invalid KYC payload: ${sentinel}`, { status: 400 })) as typeof fetch;

    let thrown: unknown;
    try {
      await service.submitKycLevel1(payload);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BrlaApiError);
    for (const calls of Object.values(logCalls)) {
      expect(JSON.stringify(calls)).not.toContain(sentinel);
    }
    expect(String(thrown)).not.toContain(sentinel);
    expect(JSON.stringify(thrown)).not.toContain(sentinel);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("BrlaApiService sensitive KYB requests", () => {
  test("never logs or throws UBO or company payloads echoed by the provider", async () => {
    const sentinel = "SENTINEL-KYB-PII";
    const keyPair = forge.pki.rsa.generateKeyPair(1024);
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, { apiKey: "test-key", privateKey: forge.pki.privateKeyToPem(keyPair.privateKey) });
    const logCalls: Record<"debug" | "error" | "info" | "warn", unknown[][]> = {
      debug: [],
      error: [],
      info: [],
      warn: []
    };
    logger.current = {
      debug: (...args: unknown[]) => logCalls.debug.push(args),
      error: (...args: unknown[]) => logCalls.error.push(args),
      info: (...args: unknown[]) => logCalls.info.push(args),
      warn: (...args: unknown[]) => logCalls.warn.push(args)
    };
    globalThis.fetch = mock(async () => new Response(`invalid KYB payload: ${sentinel}`, { status: 400 })) as typeof fetch;

    const thrown: unknown[] = [];
    for (const request of [
      () => service.createUbo({ ...ubo, fullName: sentinel }, "sub-1"),
      () => service.submitKybLevel1({ ...kyb, companyLegalName: sentinel }, "sub-1")
    ]) {
      try {
        await request();
      } catch (error) {
        thrown.push(error);
      }
    }

    expect(thrown).toHaveLength(2);
    for (const error of thrown) {
      expect(error).toBeInstanceOf(BrlaApiError);
      expect(String(error)).not.toContain(sentinel);
      expect(JSON.stringify(error)).not.toContain(sentinel);
    }
    expect(logCalls.debug).toEqual([
      [`Sending request to ${Endpoint.Ubos} with method POST; sensitive request details omitted`],
      [`Sending request to ${Endpoint.Level1Api} with method POST; sensitive request details omitted`]
    ]);
    for (const calls of Object.values(logCalls)) {
      expect(JSON.stringify(calls)).not.toContain(sentinel);
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("BrlaApiService paginated provider history", () => {
  it("returns every KYC attempt page and encodes the provider cursor", async () => {
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    const sendRequest = mock(async (_endpoint: Endpoint, _method: string, query: string) => {
      const id = sendRequest.mock.calls.length === 1 ? "attempt-1" : "attempt-2";
      return {
        attempts: [
          {
            createdAt: "2026-08-14T12:00:00.000Z",
            id,
            levelName: "level-1",
            status: "PENDING",
            updatedAt: "2026-08-14T12:00:00.000Z"
          }
        ],
        ...(query.includes("cursor=") ? {} : { cursor: "next/page?" })
      };
    });
    Object.assign(service, { sendRequest });

    await expect(service.getKycAttempts("sub/account")).resolves.toMatchObject({
      attempts: [{ id: "attempt-1" }, { id: "attempt-2" }]
    });
    expect(sendRequest.mock.calls.map(call => call[2])).toEqual([
      "subAccountId=sub%2Faccount",
      "subAccountId=sub%2Faccount&cursor=next%2Fpage%3F"
    ]);
  });

  it("returns every uploaded-document page", async () => {
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    const sendRequest = mock(async () => ({
      cursor: sendRequest.mock.calls.length === 1 ? "page-2" : null,
      documents: [
        {
          documentType: BrDocumentType.PASSPORT,
          id: `document-${sendRequest.mock.calls.length}`,
          ready: true,
          uploadStatusFront: "PROCESSED"
        }
      ]
    }));
    Object.assign(service, { sendRequest });

    await expect(service.getUploadedDocuments("sub-1")).resolves.toMatchObject({
      documents: [{ id: "document-1" }, { id: "document-2" }]
    });
    expect(sendRequest).toHaveBeenCalledTimes(2);
  });

  it("fails closed when Avenia repeats a pagination cursor", async () => {
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, {
      sendRequest: mock(async () => ({ attempts: [], cursor: "same-cursor" }))
    });

    await expect(service.getKycAttempts("sub-1")).rejects.toThrow("repeated a cursor");
  });

  it("stops uploaded-document pagination after exactly 100 requests", async () => {
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    const sendRequest = mock(async () => ({
      cursor: `cursor-${sendRequest.mock.calls.length}`,
      documents: []
    }));
    Object.assign(service, { sendRequest });

    await expect(service.getUploadedDocuments("sub-1")).rejects.toThrow(
      "Avenia pagination exceeded the maximum page limit"
    );
    expect(sendRequest).toHaveBeenCalledTimes(100);
  });

  it("stops KYC-attempt pagination after exactly 100 requests", async () => {
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    const sendRequest = mock(async () => ({
      attempts: [],
      cursor: `cursor-${sendRequest.mock.calls.length}`
    }));
    Object.assign(service, { sendRequest });

    await expect(service.getKycAttempts("sub-1")).rejects.toThrow("Avenia pagination exceeded the maximum page limit");
    expect(sendRequest).toHaveBeenCalledTimes(100);
  });
});

describe("BrlaApiService.sendRequest path templating", () => {
  // GetKybAttempt is "/v2/kyc/attempts/{attemptId}". Before templating, the path param
  // was appended, signing and requesting a literal "/{attemptId}/<id>" URL.
  it("interpolates the {attemptId} template instead of appending the path param", async () => {
    let requestedUrl: string | undefined;
    let signal: AbortSignal | null | undefined;
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input);
      signal = init?.signal;
      return new Response(
        JSON.stringify({
          attempt: {
            createdAt: "2026-08-06T12:00:00.000Z",
            id: "attempt-9",
            levelName: "kyb-level-1",
            resultMessage: "",
            retryable: false,
            status: "PENDING",
            updatedAt: "2026-08-06T12:00:00.000Z"
          }
        }),
        {
        headers: { "Content-Type": "application/json" },
        status: 200
        }
      );
    });

    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { format: "pem", type: "pkcs1" },
      publicKeyEncoding: { format: "pem", type: "pkcs1" }
    });
    const service = Object.create(BrlaApiService.prototype) as BrlaApiService;
    Object.assign(service, { apiKey: "test-api-key", privateKey });

    await service.getKybAttemptStatus("attempt-9");

    expect(requestedUrl).toContain("/v2/kyc/attempts/attempt-9");
    expect(requestedUrl).not.toContain("{attemptId}");
    // A hung connection must not stall callers forever — cron workers with
    // waitForCompletion would otherwise never run another cycle.
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
