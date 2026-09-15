import { describe, expect, it, mock } from "bun:test";
import { MoneriumApiError } from "@vortexfi/shared";
import { APIError } from "../../errors/api-error";
import { createResolveMoneriumIdentity, MONERIUM_ONBOARDING_REQUIRED, type MoneriumBinding } from "./identity";
import { MONERIUM_REAUTHENTICATION_REQUIRED } from "./monerium.service";

const PROFILE_ID = "9e6a92a5-5f6d-48aa-a57b-0f8ae8eb745d";
const binding: MoneriumBinding = { customerEntityId: "entity-1", customerType: "individual", profileId: PROFILE_ID };

function profile() {
  return {
    details: { state: "approved" as const },
    form: { state: "approved" as const },
    id: PROFILE_ID,
    kind: "personal" as const,
    name: "Ada Example",
    state: "approved" as const,
    verifications: []
  };
}

function apiError(status: number) {
  return new MoneriumApiError({ endpoint: "/profiles/:profile", method: "GET", status });
}

function client(getProfile: () => Promise<ReturnType<typeof profile>>) {
  return {
    getProfile: mock(getProfile),
    linkAddress: mock(async () => ({ httpStatus: 201 as const })),
    listAddresses: mock(async () => ({ addresses: [] })),
    listIbans: mock(async () => ({ ibans: [] })),
    requestIban: mock(async () => ({ httpStatus: 202 as const })),
    updateIbanDestination: mock(async () => undefined)
  };
}

describe("resolveMoneriumIdentity", () => {
  it("uses the white-label app when it can read the bound profile", async () => {
    const whiteLabel = client(async () => profile());
    const getUserClient = mock(async () => client(async () => profile()));
    const resolve = createResolveMoneriumIdentity({
      getUserClient,
      getWhiteLabelClient: () => whiteLabel,
      loadBinding: async () => binding
    });

    const identity = await resolve("user-1");

    expect(identity).toMatchObject({ client: whiteLabel, profileId: PROFILE_ID, source: "whitelabel" });
    expect(identity.profile.state).toBe("approved");
    expect(getUserClient).not.toHaveBeenCalled();
  });

  it.each([403, 404])("falls back to the user's OAuth token when the white-label app answers %i", async status => {
    const user = client(async () => profile());
    const getUserClient = mock(async () => user);
    const resolve = createResolveMoneriumIdentity({
      getUserClient,
      getWhiteLabelClient: () => client(async () => Promise.reject(apiError(status))),
      loadBinding: async () => binding
    });

    const identity = await resolve("user-1");

    expect(identity).toMatchObject({ profileId: PROFILE_ID, source: "oauth" });
    await identity.client.listAddresses({ chain: "polygon", profile: PROFILE_ID });
    expect(user.listAddresses).toHaveBeenCalledWith({ chain: "polygon", profile: PROFILE_ID });
    expect(getUserClient).toHaveBeenCalledWith("entity-1", "individual");
  });

  it("passes an explicit legal type through binding resolution", async () => {
    const loadBinding = mock(async () => binding);
    const resolve = createResolveMoneriumIdentity({
      getUserClient: async () => client(async () => profile()),
      getWhiteLabelClient: () => client(async () => profile()),
      loadBinding
    });

    await resolve("user-1", undefined, "individual");
    expect(loadBinding).toHaveBeenCalledWith("user-1", undefined, "individual");
  });

  it("propagates white-label failures other than invisibility instead of switching apps", async () => {
    const getUserClient = mock(async () => client(async () => profile()));
    const resolve = createResolveMoneriumIdentity({
      getUserClient,
      getWhiteLabelClient: () => client(async () => Promise.reject(apiError(503))),
      loadBinding: async () => binding
    });

    await expect(resolve("user-1")).rejects.toMatchObject({ status: 503 });
    expect(getUserClient).not.toHaveBeenCalled();
  });

  it.each([null, { ...binding, profileId: null }])("requires a Monerium binding with a profile (%p)", async loaded => {
    const resolve = createResolveMoneriumIdentity({
      getUserClient: async () => client(async () => profile()),
      getWhiteLabelClient: () => client(async () => profile()),
      loadBinding: async () => loaded
    });

    const error = await resolve("user-1").catch(caught => caught);
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ isPublic: true, status: 403, type: MONERIUM_ONBOARDING_REQUIRED });
  });

  it("surfaces a missing OAuth session as reauthentication required", async () => {
    const reauth = new APIError({ message: "Monerium reauthentication is required", status: 404, type: MONERIUM_REAUTHENTICATION_REQUIRED });
    const resolve = createResolveMoneriumIdentity({
      getUserClient: async () => Promise.reject(reauth),
      getWhiteLabelClient: () => client(async () => Promise.reject(apiError(403))),
      loadBinding: async () => binding
    });

    await expect(resolve("user-1")).rejects.toMatchObject({ type: MONERIUM_REAUTHENTICATION_REQUIRED });
  });

  it("maps a rejected user token to reauthentication required", async () => {
    const resolve = createResolveMoneriumIdentity({
      getUserClient: async () => client(async () => Promise.reject(apiError(401))),
      getWhiteLabelClient: () => client(async () => Promise.reject(apiError(404))),
      loadBinding: async () => binding
    });

    const error = await resolve("user-1").catch(caught => caught);
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ isPublic: true, status: 404, type: MONERIUM_REAUTHENTICATION_REQUIRED });
  });

  it("maps a rejected user token after the profile read to reauthentication required", async () => {
    const user = client(async () => profile());
    user.listAddresses.mockImplementation(async () => Promise.reject(apiError(401)));
    const resolve = createResolveMoneriumIdentity({
      getUserClient: async () => user,
      getWhiteLabelClient: () => client(async () => Promise.reject(apiError(403))),
      loadBinding: async () => binding
    });

    const identity = await resolve("user-1");
    await expect(identity.client.listAddresses({ chain: "polygon", profile: PROFILE_ID })).rejects.toMatchObject({
      isPublic: true,
      status: 404,
      type: MONERIUM_REAUTHENTICATION_REQUIRED
    });
  });
});
