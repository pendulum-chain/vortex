import { afterEach, describe, expect, it, mock } from "bun:test";
import ApiCredential from "../../models/apiCredential.model";
import Partner from "../../models/partner.model";
import { digestApiKey, generateApiKey, getSecretKeyLookupPrefix } from "./apiKeyFormat";
import { apiKeyAuth, enforcePartnerAuth } from "./apiKeyAuth";
import { optionalPartnerOrUserAuth } from "./dualAuth";
import { validatePublicKey } from "./publicKeyAuth";

const originalFindAll = ApiCredential.findAll;
const originalFindOne = ApiCredential.findOne;
const originalPartnerFindOne = Partner.findOne;

afterEach(() => {
  ApiCredential.findAll = originalFindAll;
  ApiCredential.findOne = originalFindOne;
  Partner.findOne = originalPartnerFindOne;
});

function responseDouble() {
  const response = {
    body: undefined as unknown,
    json: mock((body: unknown) => {
      response.body = body;
      return response;
    }),
    status: mock(() => response)
  };
  return response;
}

describe("validatePublicKey", () => {
  it("rejects a body/header public key mismatch before continuing", async () => {
    const next = mock(() => undefined);
    const response = responseDouble();
    await validatePublicKey()(
      {
        body: { apiKey: "pk_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
        headers: { "x-public-key": "pk_test_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" },
        query: {}
      } as never,
      response as never,
      next
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect((response.body as { error: { code: string } }).error.code).toBe("CREDENTIAL_MISMATCH");
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects public and secret values from different credentials", async () => {
    const publicKey = generateApiKey("public", "test");
    const secretKey = generateApiKey("secret", "test");
    const publicCredential = Object.assign(new ApiCredential(), {
      environment: "test",
      id: "public-credential",
      partnerId: null,
      profileId: "profile-1",
      publicKeyValue: publicKey,
      update: mock(async () => publicCredential)
    });
    const secretCredential = Object.assign(new ApiCredential(), {
      environment: "test",
      id: "secret-credential",
      partnerId: null,
      profileId: "profile-1",
      secretKeyDigest: digestApiKey(secretKey),
      secretKeyPrefix: getSecretKeyLookupPrefix(secretKey),
      update: mock(async () => secretCredential)
    });
    ApiCredential.findOne = mock(async () => publicCredential) as never;
    ApiCredential.findAll = mock(async () => [secretCredential]) as never;

    const request = { body: {}, headers: { "x-api-key": secretKey, "x-public-key": publicKey }, query: {} };
    const publicResponse = responseDouble();
    await validatePublicKey()(request as never, publicResponse as never, mock(() => undefined));

    const secretResponse = responseDouble();
    const next = mock(() => undefined);
    await apiKeyAuth()(request as never, secretResponse as never, next);

    expect(secretResponse.status).toHaveBeenCalledWith(403);
    expect((secretResponse.body as { error: { code: string } }).error.code).toBe("CREDENTIAL_MISMATCH");
    expect(next).not.toHaveBeenCalled();

    const dualResponse = responseDouble();
    const dualNext = mock(() => undefined);
    await optionalPartnerOrUserAuth()(
      { body: {}, headers: { "x-api-key": secretKey, "x-public-key": publicKey } } as never,
      dualResponse as never,
      dualNext
    );

    expect(dualResponse.status).toHaveBeenCalledWith(403);
    expect((dualResponse.body as { error: { code: string } }).error.code).toBe("CREDENTIAL_MISMATCH");
    expect(dualNext).not.toHaveBeenCalled();
  });
});

describe("enforcePartnerAuth", () => {
  it("rejects a same-name partner whose canonical ID differs from the credential", async () => {
    Partner.findOne = mock(async () => ({ id: "requested-partner-id", name: "Partner" }) as Partner) as typeof Partner.findOne;
    const response = responseDouble();
    const next = mock(() => undefined);

    await enforcePartnerAuth()(
      {
        authenticatedPartner: { id: "credential-partner-id", name: "Partner" },
        body: { partnerId: "Partner" },
        credential: {
          credentialId: "credential-1",
          environment: "test",
          partnerId: "credential-partner-id",
          profileId: "profile-1",
          strength: "secret"
        }
      } as never,
      response as never,
      next
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect((response.body as { error: { code: string } }).error.code).toBe("PARTNER_MISMATCH");
    expect(next).not.toHaveBeenCalled();
  });

  it("does not authorize from the compatibility partner field", async () => {
    const response = responseDouble();
    const next = mock(() => undefined);

    await enforcePartnerAuth()(
      { authenticatedPartner: { id: "partner-1", name: "Partner" }, body: { partnerId: "Partner" } } as never,
      response as never,
      next
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect((response.body as { error: { code: string } }).error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });
});
