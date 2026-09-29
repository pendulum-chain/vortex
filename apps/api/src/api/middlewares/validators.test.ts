import { AveniaAccountType, BrDocumentType, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import { describe, expect, it, mock } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { APIError } from "../errors/api-error";
import {
  validateAveniaKycTokenImport,
  validateAveniaKybDocument,
  validateAveniaKybLevel1,
  validateAveniaKybUbo,
  validateCreateBestQuoteInput,
  validateKycSubmission,
  validateSubaccountCreation
} from "./validators";

function buildRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = mock((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as Response["status"];
  res.json = mock((payload: unknown) => {
    res.body = payload;
    return res as Response;
  }) as Response["json"];
  return res as Response & { statusCode?: number; body?: unknown };
}

function runValidator(body: Record<string, unknown>) {
  const req = { body } as unknown as Request;
  const res = buildRes();
  const next: NextFunction = mock(() => undefined) as unknown as NextFunction;
  validateCreateBestQuoteInput(req, res, next);
  return { next, res };
}

const baseBody = {
  inputAmount: "100",
  inputCurrency: "BRL",
  outputCurrency: "USDC",
  rampType: RampDirection.BUY,
  from: "pix"
};

describe("validateCreateBestQuoteInput - networks whitelist", () => {
  it("passes when networks is omitted (preserves existing behavior)", () => {
    const { next, res } = runValidator({ ...baseBody });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });

  it("passes when networks is a valid array of Networks values", () => {
    const { next, res } = runValidator({ ...baseBody, networks: [Networks.Base, Networks.Polygon] });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });

  it("normalizes case-insensitive networks entries to canonical Networks values", () => {
    const body: Record<string, unknown> = { ...baseBody, networks: ["BASE", "Polygon", "BASE-SEPOLIA", "polygonamoy"] };
    const req = { body } as unknown as Request;
    const res = buildRes();
    const nextMock = mock((_error?: unknown) => undefined);
    const next = nextMock as unknown as NextFunction;
    validateCreateBestQuoteInput(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
    expect(body.networks).toEqual([Networks.Base, Networks.Polygon, Networks.BaseSepolia, Networks.PolygonAmoy]);
  });

  it("passes when networks is an empty array (treated as omitted)", () => {
    const { next, res } = runValidator({ ...baseBody, networks: [] });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });

  it("rejects with 400 when networks contains an unknown identifier", () => {
    const { next, res } = runValidator({ ...baseBody, networks: ["base", "not-a-real-chain"] });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ message: QuoteError.InvalidNetworks });
  });

  it("rejects with 400 when networks is not an array", () => {
    const { next, res } = runValidator({ ...baseBody, networks: "base" });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ message: QuoteError.InvalidNetworks });
  });

  it("rejects with 400 when networks contains a non-string entry", () => {
    const { next, res } = runValidator({ ...baseBody, networks: [Networks.Base, 42] });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ message: QuoteError.InvalidNetworks });
  });

  it("rejects with 400 when required fields are missing even if networks is valid", () => {
    const { next, res } = runValidator({ rampType: RampDirection.BUY, networks: [Networks.Base] });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ message: QuoteError.MissingRequiredFields });
  });
});

describe("Avenia API KYB validators", () => {
  it("rejects double-sided corporate documents", () => {
    const req = {
      body: { documentType: BrDocumentType.CERTIFICATE_OF_INCORPORATION, isDoubleSided: true }
    } as Request;
    const res = buildRes();
    const next = mock(() => undefined) as unknown as NextFunction;

    validateAveniaKybDocument(req, res, next);

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts double-sided UBO identification documents", () => {
    const req = {
      body: { documentType: BrDocumentType.ID, isDoubleSided: true }
    } as Request;
    const res = buildRes();
    const next = mock(() => undefined) as unknown as NextFunction;

    validateAveniaKybDocument(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });

  it("rejects final submission without a UBO", () => {
    const req = {
      body: {
        businessActivityDescription: "Software development",
        certificateOfIncorporationDocumentId: "certificate-1",
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
        taxIdentificationDocumentId: "tax-document-1",
        taxIdentificationNumberTin: "42731085000167",
        uboIds: []
      }
    } as unknown as Request;
    const res = buildRes();
    const next = mock(() => undefined) as unknown as NextFunction;

    validateAveniaKybLevel1(req, res, next);

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an underage UBO before calling Avenia", () => {
    const req = {
      body: {
        city: "Sao Paulo",
        country: "BRA",
        countryOfTaxId: "BRA",
        dateOfBirth: new Date().toISOString().slice(0, 10),
        documentCountry: "BRA",
        fullName: "Test Owner",
        percentageOfOwnership: "100",
        state: "SP",
        streetLine1: "Av Paulista 1000",
        taxIdNumber: "08786985906",
        uploadedIdentificationId: "identity-1",
        zipCode: "01310-100"
      }
    } as unknown as Request;
    const res = buildRes();
    const next = mock(() => undefined) as unknown as NextFunction;

    validateAveniaKybUbo(req, res, next);

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("validateAveniaKycTokenImport", () => {
  function validate(body: unknown, idempotencyKey?: string) {
    const req = {
      body,
      get: mock((header: string) => (header === "Idempotency-Key" ? idempotencyKey : undefined))
    } as unknown as Request;
    const res = buildRes();
    const next = mock(() => undefined) as unknown as NextFunction;

    validateAveniaKycTokenImport(req, res, next);

    return { next, res };
  }

  it("requires a visible-ASCII idempotency key", () => {
    for (const key of [undefined, "bad key", "é", "x".repeat(129)]) {
      const { next, res } = validate({ consentAttested: true, importToken: "token" }, key);
      expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("rejects unknown body fields", () => {
    const { next, res } = validate({ consentAttested: true, importToken: "token", tokenType: "sumsub" }, "request-1");

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(next).not.toHaveBeenCalled();
  });

  it("requires explicit true consent", () => {
    const { next, res } = validate({ consentAttested: false, importToken: "token" }, "request-1");

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(next).not.toHaveBeenCalled();
  });

  it("measures the import token limit in UTF-8 bytes", () => {
    const { next, res } = validate({ consentAttested: true, importToken: "é".repeat(513) }, "request-1");

    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts the strict token import shape", () => {
    const { next, res } = validate({ consentAttested: true, importToken: "é".repeat(512) }, "request-1");

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });
});

describe("validateKycSubmission", () => {
  it("forwards structured API errors for invalid Argentina submissions", () => {
    const req = {
      body: {
        country: "AR",
        pep: false,
        phoneNumber: "+5511999999999"
      }
    } as unknown as Request;
    const res = buildRes();
    const nextMock = mock((_error?: unknown) => undefined);
    const next = nextMock as unknown as NextFunction;

    validateKycSubmission(req, res, next);

    expect(res.statusCode).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    const error = nextMock.mock.calls[0][0];
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).status).toBe(httpStatus.BAD_REQUEST);
    expect((error as APIError).message).toBe("Phone number must use Argentina country code (+54)");
    expect((error as APIError).errors).toEqual([{ message: "Phone number must use Argentina country code (+54)" }]);
  });

  it("accepts valid Argentina-specific fields", () => {
    const req = {
      body: {
        country: "AR",
        cuit: "20123456789",
        nationalities: ["AR"],
        pep: false,
        phoneNumber: "+5491112345678"
      }
    } as unknown as Request;
    const res = buildRes();
    const nextMock = mock((_error?: unknown) => undefined);
    const next = nextMock as unknown as NextFunction;

    validateKycSubmission(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(nextMock.mock.calls[0]?.[0]).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
  });
});

describe("validateSubaccountCreation", () => {
  // Synthetic identifiers with valid check digits (never real people or companies).
  const VALID_CPF = "52998224725";
  const VALID_CPF_FORMATTED = "529.982.247-25";
  const VALID_CNPJ = "11222333000181";
  const VALID_CNPJ_FORMATTED = "11.222.333/0001-81";

  function validate(body: unknown) {
    const req = { body } as unknown as Request;
    const res = buildRes();
    const next = mock(() => undefined) as unknown as NextFunction;

    validateSubaccountCreation(req, res, next);

    return { next, res };
  }

  function expectRejected(body: unknown, error: string) {
    const { next, res } = validate(body);
    expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
    expect(res.body).toEqual({ error });
    expect(next).not.toHaveBeenCalled();
  }

  const individual = { accountType: AveniaAccountType.INDIVIDUAL, name: "Ana Maria Silva", taxId: VALID_CPF };
  const company = { accountType: AveniaAccountType.COMPANY, name: "Acme Ltda", taxId: VALID_CNPJ };

  it("accepts a valid CPF, plain or formatted, for an individual", () => {
    for (const taxId of [VALID_CPF, VALID_CPF_FORMATTED, ` ${VALID_CPF} `]) {
      const { next, res } = validate({ ...individual, taxId });
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeUndefined();
    }
  });

  it("accepts a valid CNPJ, plain or formatted, for a company", () => {
    for (const taxId of [VALID_CNPJ, VALID_CNPJ_FORMATTED]) {
      const { next, res } = validate({ ...company, taxId });
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeUndefined();
    }
  });

  it("rejects checksum-invalid and trivial identifiers", () => {
    for (const taxId of ["52998224724", "12345678901", "11111111111", "abc", "", "529.982.247-2"]) {
      expectRejected({ ...individual, taxId }, "taxId must be a valid CPF for INDIVIDUAL accounts.");
    }
    expectRejected({ ...company, taxId: "11222333000182" }, "taxId must be a valid CNPJ for COMPANY accounts.");
  });

  it("rejects a CPF for a company and a CNPJ for an individual", () => {
    expectRejected({ ...company, taxId: VALID_CPF }, "taxId must be a valid CNPJ for COMPANY accounts.");
    expectRejected({ ...individual, taxId: VALID_CNPJ }, "taxId must be a valid CPF for INDIVIDUAL accounts.");
  });

  it("rejects a missing or non-string taxId", () => {
    for (const taxId of [undefined, null, 52998224725, [VALID_CPF], { value: VALID_CPF }]) {
      expectRejected({ ...individual, taxId }, "taxId must be a valid CPF for INDIVIDUAL accounts.");
    }
  });

  it("rejects a missing, non-string, blank or oversized name", () => {
    const error = "name must be a non-empty string of at most 255 characters.";
    for (const name of [undefined, null, 42, ["Ana"], "", "   ", "x".repeat(256)]) {
      expectRejected({ ...individual, name }, error);
    }
    const { next } = validate({ ...individual, name: "x".repeat(255) });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown or missing accountType before looking at the other fields", () => {
    for (const accountType of [undefined, "BUSINESS", 1]) {
      expectRejected({ ...individual, accountType }, "Invalid accountType.");
    }
  });

  it("rejects a missing body instead of throwing", () => {
    expectRejected(undefined, "Invalid accountType.");
  });
});
