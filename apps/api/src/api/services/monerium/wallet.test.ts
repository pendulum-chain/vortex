import { describe, expect, it, mock } from "bun:test";
import { MONERIUM_ADDRESS_OWNERSHIP_MESSAGE, MoneriumApiError, Networks } from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import type { Transaction } from "sequelize";
import { APIError } from "../../errors/api-error";
import type { MoneriumIdentity } from "./identity";
import { getMoneriumRampReadiness, linkMoneriumWallet, moveMoneriumIban, verifyMoneriumWalletOwnership } from "./wallet";

const PROFILE_ID = "9e6a92a5-5f6d-48aa-a57b-0f8ae8eb745d";
const OWNER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const OTHER = "0x2222222222222222222222222222222222222222";

function iban(address: string, chain = "polygon") {
  return { address, bic: "DEUTDEFF", chain, iban: "DE89370400440532013000", name: "Monerium EMI", profile: PROFILE_ID };
}

function client(options: { addresses?: string[]; ibans?: ReturnType<typeof iban>[]; requestIbanError?: Error } = {}) {
  return {
    getProfile: mock(async () => ({ id: PROFILE_ID, kind: "personal", state: "approved" })),
    linkAddress: mock(async () => ({ httpStatus: 201 as const })),
    listAddresses: mock(async ({ chain }: { chain?: string }) => ({
      addresses: (options.addresses ?? []).map(address => ({ address, chains: [chain ?? "polygon"], profile: PROFILE_ID }))
    })),
    listIbans: mock(async () => ({ ibans: options.ibans ?? [] })),
    requestIban: mock(async () => {
      if (options.requestIbanError) throw options.requestIbanError;
      return { httpStatus: 202 as const };
    }),
    updateIbanDestination: mock(async () => undefined)
  };
}

function deps(monerium: ReturnType<typeof client>, overrides: Partial<Parameters<typeof linkMoneriumWallet>[2]> = {}) {
  const identity = { client: monerium, profile: { state: "approved" }, profileId: PROFILE_ID, source: "oauth" } as unknown as MoneriumIdentity;
  return {
    findActiveRampForOwner: async () => null,
    isContractAddress: async () => false,
    lockOwner: async () => undefined,
    resolveIdentity: async () => identity,
    runWithProfileLock: async <T>(_profileId: string, work: (transaction: Transaction) => Promise<T>): Promise<T> =>
      work(undefined as unknown as Transaction),
    verifyOwnership: async () => true,
    ...overrides
  };
}

async function ownerSignature(): Promise<`0x${string}`> {
  return OWNER.signMessage({ message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE });
}

describe("getMoneriumRampReadiness", () => {
  it("reads the profile matching the requested legal type", async () => {
    const monerium = client({ addresses: [OWNER.address], ibans: [iban(OWNER.address)] });
    const resolveIdentity = mock(async () => deps(monerium).resolveIdentity("user-1"));
    await getMoneriumRampReadiness("user-1", "individual", deps(monerium, { resolveIdentity }));
    expect(resolveIdentity).toHaveBeenCalledWith("user-1", undefined, "individual");
  });
  it("reports provisioned when the IBAN points to a linked address on the ramp chain", async () => {
    const monerium = client({ addresses: [OWNER.address], ibans: [iban(OWNER.address)] });
    await expect(getMoneriumRampReadiness("user-1", undefined, deps(monerium))).resolves.toEqual({
      chain: "polygon",
      iban: "provisioned",
      linkedAddress: OWNER.address,
      source: "oauth"
    });
    expect(monerium.listAddresses).toHaveBeenCalledWith({ chain: "polygon", profile: PROFILE_ID });
  });

  it("reports elsewhere when the profile's IBAN sits on another chain or address", async () => {
    const monerium = client({ addresses: [OWNER.address], ibans: [iban(OTHER, "ethereum")] });
    await expect(getMoneriumRampReadiness("user-1", undefined, deps(monerium))).resolves.toMatchObject({
      iban: "elsewhere",
      linkedAddress: OWNER.address
    });
  });

  it("reports missing with no linked address when nothing is provisioned", async () => {
    await expect(getMoneriumRampReadiness("user-1", undefined, deps(client()))).resolves.toMatchObject({ iban: "missing", linkedAddress: null });
  });
});

describe("linkMoneriumWallet", () => {
  it("verifies the owner signature, links once, and requests the IBAN", async () => {
    const monerium = client();
    const signature = await ownerSignature();
    const isContractAddress = mock(async () => false);
    const result = await linkMoneriumWallet(
      "user-1",
      { address: OWNER.address, chain: "polygon", signature },
      deps(monerium, {
        isContractAddress,
        verifyOwnership: async (address, sig) => address === OWNER.address && sig === signature
      })
    );

    expect(result).toEqual({ address: OWNER.address, chain: "polygon", iban: "pending" });
    expect(isContractAddress).toHaveBeenCalledWith(Networks.Polygon, OWNER.address);
    expect(monerium.linkAddress).toHaveBeenCalledWith({
      address: OWNER.address,
      chain: "polygon",
      message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE,
      profile: PROFILE_ID,
      signature
    });
    expect(monerium.requestIban).toHaveBeenCalledWith({ address: OWNER.address, chain: "polygon" });
  });

  it("accepts only the owner's signature over the fixed message", async () => {
    const signature = await ownerSignature();
    const forged = await privateKeyToAccount("0x2222222222222222222222222222222222222222222222222222222222222222").signMessage({
      message: MONERIUM_ADDRESS_OWNERSHIP_MESSAGE
    });
    await expect(verifyMoneriumWalletOwnership(OWNER.address, signature)).resolves.toBe(true);
    await expect(verifyMoneriumWalletOwnership(OWNER.address, forged)).resolves.toBe(false);
    await expect(verifyMoneriumWalletOwnership(OWNER.address, "0xab")).resolves.toBe(false);
  });

  it("skips linking when the address is already linked and reports an existing IBAN", async () => {
    const monerium = client({ addresses: [OWNER.address], ibans: [iban(OWNER.address)] });
    const result = await linkMoneriumWallet("user-1", { address: OWNER.address, chain: "polygon", signature: await ownerSignature() }, deps(monerium));
    expect(result.iban).toBe("provisioned");
    expect(monerium.linkAddress).not.toHaveBeenCalled();
    expect(monerium.requestIban).not.toHaveBeenCalled();
  });

  it("reports elsewhere instead of requesting a second IBAN", async () => {
    const monerium = client({ ibans: [iban(OTHER, "ethereum")] });
    const result = await linkMoneriumWallet("user-1", { address: OWNER.address, chain: "polygon", signature: await ownerSignature() }, deps(monerium));
    expect(result.iban).toBe("elsewhere");
    expect(monerium.requestIban).not.toHaveBeenCalled();
  });

  it("treats Monerium's already-requested answer as pending", async () => {
    const monerium = client({ requestIbanError: new MoneriumApiError({ endpoint: "/ibans", method: "POST", status: 400 }) });
    const result = await linkMoneriumWallet("user-1", { address: OWNER.address, chain: "polygon", signature: await ownerSignature() }, deps(monerium));
    expect(result.iban).toBe("pending");
  });

  it.each([
    ["an unsupported chain", { address: OWNER.address, chain: "gnosis", signature: "0xab" }, "chain must be one of"],
    ["a malformed address", { address: "nope", chain: "polygon", signature: "0xab" }, "address must be a valid EVM address"],
    ["a non-hex signature", { address: OWNER.address, chain: "polygon", signature: "sig" }, "signature must be hex-encoded"]
  ])("rejects %s before touching Monerium", async (_label, input, message) => {
    const monerium = client();
    await expect(linkMoneriumWallet("user-1", input, deps(monerium))).rejects.toThrow(message);
    expect(monerium.listAddresses).not.toHaveBeenCalled();
  });

  it("rejects a signature that does not prove ownership", async () => {
    const monerium = client();
    await expect(
      linkMoneriumWallet("user-1", { address: OWNER.address, chain: "polygon", signature: "0xab" }, deps(monerium, { verifyOwnership: async () => false }))
    ).rejects.toThrow("signature does not prove ownership");
    expect(monerium.listAddresses).not.toHaveBeenCalled();
  });

  it("rejects contract wallets", async () => {
    const monerium = client();
    const error = await linkMoneriumWallet(
      "user-1",
      { address: OWNER.address, chain: "polygon", signature: "0xab" },
      deps(monerium, { isContractAddress: async () => true })
    ).catch(caught => caught);
    expect(error).toBeInstanceOf(APIError);
    expect(error.message).toContain("Contract wallets are not supported");
    expect(monerium.linkAddress).not.toHaveBeenCalled();
  });

  it("holds the profile lock while linking the address and requesting the IBAN", async () => {
    const monerium = client();
    const order: string[] = [];
    monerium.linkAddress.mockImplementation(async () => {
      order.push("link");
      return { httpStatus: 201 as const };
    });
    monerium.requestIban.mockImplementation(async () => {
      order.push("iban");
      return { httpStatus: 202 as const };
    });
    const runWithProfileLock = async <T>(profileId: string, work: (transaction: Transaction) => Promise<T>): Promise<T> => {
      order.push(`lock:${profileId}`);
      const result = await work(undefined as unknown as Transaction);
      order.push("unlock");
      return result;
    };

    await linkMoneriumWallet(
      "user-1",
      { address: OWNER.address, chain: "polygon", signature: await ownerSignature() },
      deps(monerium, { runWithProfileLock })
    );

    expect(order).toEqual([`lock:${PROFILE_ID}`, "link", "iban", "unlock"]);
  });
});

describe("moveMoneriumIban", () => {
  it("moves the single IBAN to an already-linked address", async () => {
    const monerium = client({ addresses: [OWNER.address], ibans: [iban(OTHER, "ethereum")] });
    const result = await moveMoneriumIban("user-1", { address: OWNER.address, chain: "polygon" }, deps(monerium));
    expect(result).toEqual({ address: OWNER.address, chain: "polygon", iban: "provisioned" });
    expect(monerium.updateIbanDestination).toHaveBeenCalledWith("DE89370400440532013000", { address: OWNER.address, chain: "polygon" });
  });

  it("is a no-op when the IBAN already points there", async () => {
    const monerium = client({ addresses: [OWNER.address], ibans: [iban(OWNER.address)] });
    await moveMoneriumIban("user-1", { address: OWNER.address, chain: "polygon" }, deps(monerium));
    expect(monerium.updateIbanDestination).not.toHaveBeenCalled();
  });

  it("requires the destination to be linked first", async () => {
    const monerium = client({ ibans: [iban(OTHER, "ethereum")] });
    await expect(moveMoneriumIban("user-1", { address: OWNER.address, chain: "polygon" }, deps(monerium))).rejects.toThrow("is not linked");
    expect(monerium.updateIbanDestination).not.toHaveBeenCalled();
  });

  it("refuses to move the IBAN away from a wallet with a live ramp", async () => {
    const monerium = client({ addresses: [OWNER.address], ibans: [iban(OTHER, "ethereum")] });
    const findActiveRampForOwner = mock(async () => "ramp-live");
    await expect(
      moveMoneriumIban("user-1", { address: OWNER.address, chain: "polygon" }, deps(monerium, { findActiveRampForOwner }))
    ).rejects.toMatchObject({ isPublic: true, status: 409 });
    expect(findActiveRampForOwner).toHaveBeenCalledWith(OTHER, undefined);
    expect(monerium.updateIbanDestination).not.toHaveBeenCalled();
  });

  it("locks the IBAN's current owner before checking for a live ramp and moving it", async () => {
    const monerium = client({ addresses: [OWNER.address], ibans: [iban(OTHER, "ethereum")] });
    const lockOwner = mock(async () => undefined);
    const findActiveRampForOwner = mock(async () => null);
    await moveMoneriumIban(
      "user-1",
      { address: OWNER.address, chain: "polygon" },
      deps(monerium, { lockOwner, findActiveRampForOwner })
    );
    expect(lockOwner).toHaveBeenCalledWith(OTHER, undefined);
    expect(lockOwner).toHaveBeenCalledTimes(1);
    expect(findActiveRampForOwner).toHaveBeenCalledWith(OTHER, undefined);
    expect(monerium.updateIbanDestination).toHaveBeenCalledTimes(1);
  });

  it("requires exactly one IBAN", async () => {
    const monerium = client({ addresses: [OWNER.address] });
    await expect(moveMoneriumIban("user-1", { address: OWNER.address, chain: "polygon" }, deps(monerium))).rejects.toMatchObject({ status: 409 });
  });
});
