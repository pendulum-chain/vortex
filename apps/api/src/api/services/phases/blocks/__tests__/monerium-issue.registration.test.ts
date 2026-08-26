import { describe, expect, it, mock } from "bun:test";
import { type MoneriumChain, Networks } from "@vortexfi/shared";
import { createRegisterMoneriumIssue } from "../phases/monerium-issue/registration";
import { MONERIUM_EURE, type MoneriumIssueNetwork } from "../phases/monerium-issue/simulation";

const PROFILE_ID = "9e6a92a5-5f6d-48aa-a57b-0f8ae8eb745d";
const ADDRESS = "0x1212121212121212121212121212121212121212";

function profile(state: "approved" | "pending" = "approved") {
  return {
    details: { state },
    form: { state },
    id: PROFILE_ID,
    kind: "personal" as const,
    name: "Ada Example",
    state,
    verifications: []
  };
}

function client(
  overrides: { addresses?: unknown[]; chain?: MoneriumChain; ibans?: unknown[]; state?: "approved" | "pending" } = {}
) {
  const chain = overrides.chain ?? "base";
  return {
    getProfile: mock(async () => profile(overrides.state)),
    listAddresses: mock(async () => ({
      addresses: overrides.addresses ?? [{ address: ADDRESS, chains: [chain], profile: PROFILE_ID }]
    })),
    listIbans: mock(async () => ({
      ibans:
        overrides.ibans ??
        [{ address: ADDRESS, bic: "DEUTDEFF", chain, iban: "DE89370400440532013000", name: "Monerium EMI", profile: PROFILE_ID }]
    }))
  };
}

function context(input: Record<string, unknown> = {}, network: MoneriumIssueNetwork = Networks.Base) {
  return {
    authenticatedUser: { id: "effective-user-1" },
    input,
    metadata: { issue: { outputAmountRaw: "98750000000000000000" }, network } as never,
    quote: { inputAmount: "100" } as never,
    signingAccounts: []
  };
}

describe("MoneriumIssue registration", () => {
  it("derives the profile from the effective user and returns one provider-authoritative Base destination", async () => {
    const monerium = client();
    const resolveProfileId = mock(async () => PROFILE_ID);
    const register = createRegisterMoneriumIssue({
      createReference: () => "VTX00000000000000000000000000000001",
      getClient: () => monerium as never,
      isContractAddress: async () => false,
      resolveProfileId
    });

    const result = await register(context());

    expect(resolveProfileId).toHaveBeenCalledWith("effective-user-1", undefined);
    expect(monerium.getProfile).toHaveBeenCalledWith(PROFILE_ID);
    expect(monerium.listAddresses).toHaveBeenCalledWith({ chain: "base", profile: PROFILE_ID });
    expect(monerium.listIbans).toHaveBeenCalledWith({ chain: "base", profile: PROFILE_ID });
    expect(result).toEqual({
      facts: {
        amountRaw: "98750000000000000000",
        chain: Networks.Base,
        moneriumAddress: ADDRESS,
        moneriumIban: "DE89370400440532013000",
        moneriumPaymentReference: "VTX00000000000000000000000000000001",
        moneriumProfileId: PROFILE_ID,
        owner: ADDRESS,
        token: MONERIUM_EURE
      },
      responseArtifacts: {
        ibanPaymentData: {
          bic: "DEUTDEFF",
          iban: "DE89370400440532013000",
          receiverName: "Monerium EMI",
          reference: "VTX00000000000000000000000000000001"
        }
      }
    });
  });

  it("selects the provider destination for the requested non-Base chain", async () => {
    const monerium = client({ chain: "amoy" });
    const isContractAddress = mock(async () => false);
    const register = createRegisterMoneriumIssue({
      createReference: () => "VTX00000000000000000000000000000002",
      getClient: () => monerium as never,
      isContractAddress,
      resolveProfileId: async () => PROFILE_ID
    });

    const result = await register(context({}, Networks.PolygonAmoy));

    expect(monerium.listAddresses).toHaveBeenCalledWith({ chain: "amoy", profile: PROFILE_ID });
    expect(monerium.listIbans).toHaveBeenCalledWith({ chain: "amoy", profile: PROFILE_ID });
    expect(isContractAddress).toHaveBeenCalledWith(Networks.PolygonAmoy, ADDRESS);
    expect(result.facts).toMatchObject({ chain: Networks.PolygonAmoy, owner: ADDRESS });
  });

  it("rejects caller-controlled identity before resolving any provider customer", async () => {
    const resolveProfileId = mock(async () => PROFILE_ID);
    const register = createRegisterMoneriumIssue({
      createReference: () => "unused",
      getClient: () => client() as never,
      isContractAddress: async () => false,
      resolveProfileId
    });

    await expect(register(context({ profileId: "foreign-profile" }))).rejects.toThrow(
      "Monerium identity is server-derived; profileId must not be supplied"
    );
    expect(resolveProfileId).not.toHaveBeenCalled();
  });

  it("requires the live profile to remain approved", async () => {
    const register = createRegisterMoneriumIssue({
      createReference: () => "unused",
      getClient: () => client({ state: "pending" }) as never,
      isContractAddress: async () => false,
      resolveProfileId: async () => PROFILE_ID
    });

    await expect(register(context())).rejects.toThrow("The Monerium profile is not approved");
  });

  it("rejects a profile-linked contract wallet that cannot sign the EOA permit", async () => {
    const register = createRegisterMoneriumIssue({
      createReference: () => "unused",
      getClient: () => client() as never,
      isContractAddress: async () => true,
      resolveProfileId: async () => PROFILE_ID
    });

    await expect(register(context())).rejects.toThrow("self-transfer requires a profile-linked EOA");
  });

  it.each([
    ["missing", []],
    [
      "ambiguous",
      [
        { address: ADDRESS, bic: "DEUTDEFF", chain: "base", iban: "DE89370400440532013000", name: "Monerium EMI", profile: PROFILE_ID },
        { address: ADDRESS, bic: "DEUTDEFF", chain: "base", iban: "DE12500105170648489890", name: "Monerium EMI", profile: PROFILE_ID }
      ]
    ]
  ])("rejects a %s provider-chain IBAN/address match", async (_label, ibans) => {
    const register = createRegisterMoneriumIssue({
      createReference: () => "unused",
      getClient: () => client({ ibans }) as never,
      isContractAddress: async () => false,
      resolveProfileId: async () => PROFILE_ID
    });

    await expect(register(context())).rejects.toThrow("Expected exactly one Monerium base IBAN/address match");
  });
});
