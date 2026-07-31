import { afterEach, describe, expect, mock, test } from "bun:test";
import { VortexSdkError } from "../src/errors";
import { ApiService } from "../src/services/ApiService";

const originalFetch = globalThis.fetch;
const rampInfo = {
  corridors: {
    BR: { canBuy: true, canSell: true, kycStatus: "approved" }
  }
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("ApiService credentials", () => {
  test("sends a configured public key", async () => {
    const fetchMock = mock(() => Promise.resolve(Response.json(rampInfo)));
    globalThis.fetch = fetchMock as typeof fetch;

    await new ApiService("https://api.example", "pk_test_public").getRampInfo();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/v1/ramp-info",
      expect.objectContaining({ headers: expect.objectContaining({ "X-Public-Key": "pk_test_public" }) })
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("X-API-Key");
  });

  test("sends a configured secret key", async () => {
    const fetchMock = mock(() => Promise.resolve(Response.json(rampInfo)));
    globalThis.fetch = fetchMock as typeof fetch;

    await new ApiService("https://api.example", undefined, "sk_test_secret").getRampInfo();

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ "X-API-Key": "sk_test_secret" })
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("X-Public-Key");
  });

  test("sends both configured keys", async () => {
    const fetchMock = mock(() => Promise.resolve(Response.json(rampInfo)));
    globalThis.fetch = fetchMock as typeof fetch;

    await new ApiService("https://api.example", "pk_test_public", "sk_test_secret").getRampInfo();

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ "X-API-Key": "sk_test_secret", "X-Public-Key": "pk_test_public" })
    );
  });

  test("preserves a credential mismatch error code", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json(
          {
            error: {
              code: "CREDENTIAL_MISMATCH",
              message: "Public and secret keys belong to different credentials",
              status: 403
            }
          },
          { status: 403 }
        )
      )
    ) as typeof fetch;

    const request = new ApiService("https://api.example", "pk_test_public", "sk_test_other").getRampInfo();

    await expect(request).rejects.toMatchObject<VortexSdkError>({ code: "CREDENTIAL_MISMATCH", status: 403 });
  });
});
