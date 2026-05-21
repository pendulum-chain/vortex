import { describe, expect, it } from "bun:test";
import { ERC20_EURE_POLYGON_TOKEN_NAME, ERC20_EURE_POLYGON_V2, Networks, PermitSignature } from "@vortexfi/shared";
import { Signature as EthersSignature, Wallet } from "ethers";
import {
  analyzeMoneriumPermitPreflight,
  validateMoneriumOnrampPermit
} from "./monerium-permit";

const OWNER = new Wallet("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const SPENDER = "0x4e84e0b84054F078D4Adc785818663eF83c032E3";
const VALUE_RAW = "1150000000000000000";
const NONCE = "0";
const DEADLINE = "1779978803";

async function signPermit(overrides: Partial<PermitSignature["context"]> = {}): Promise<PermitSignature> {
  const context = {
    chainId: 137,
    deadline: DEADLINE,
    nonce: NONCE,
    owner: OWNER.address as `0x${string}`,
    spender: SPENDER as `0x${string}`,
    tokenAddress: ERC20_EURE_POLYGON_V2,
    tokenName: ERC20_EURE_POLYGON_TOKEN_NAME,
    tokenVersion: "1",
    valueRaw: VALUE_RAW,
    ...overrides
  };
  const signature = EthersSignature.from(
    await OWNER.signTypedData(
      {
        chainId: context.chainId,
        name: context.tokenName,
        verifyingContract: context.tokenAddress,
        version: context.tokenVersion
      },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      {
        deadline: context.deadline,
        nonce: context.nonce,
        owner: context.owner,
        spender: context.spender,
        value: context.valueRaw
      }
    )
  );

  return {
    context,
    deadline: Number(context.deadline),
    r: signature.r as `0x${string}`,
    s: signature.s as `0x${string}`,
    v: signature.v
  };
}

describe("validateMoneriumOnrampPermit", () => {
  it("accepts a permit whose signed context matches the expected onramp transfer", async () => {
    const permit = await signPermit();

    expect(() =>
      validateMoneriumOnrampPermit(permit, {
        expectedOwner: OWNER.address,
        expectedSpender: SPENDER,
        expectedTokenAddress: ERC20_EURE_POLYGON_V2,
        expectedTokenName: ERC20_EURE_POLYGON_TOKEN_NAME,
        expectedValueRaw: VALUE_RAW,
        network: Networks.Polygon
      })
    ).not.toThrow();
  });

  it("rejects a permit signed for a different raw value before payment details are released", async () => {
    const permit = await signPermit({ valueRaw: "1000000000000000000" });

    expect(() =>
      validateMoneriumOnrampPermit(permit, {
        expectedOwner: OWNER.address,
        expectedSpender: SPENDER,
        expectedTokenAddress: ERC20_EURE_POLYGON_V2,
        expectedTokenName: ERC20_EURE_POLYGON_TOKEN_NAME,
        expectedValueRaw: VALUE_RAW,
        network: Networks.Polygon
      })
    ).toThrow("valueRaw");
  });

  it("rejects a permit whose signed context is missing entirely", () => {
    const permit: PermitSignature = {
      deadline: Number(DEADLINE),
      r: `0x${"0".repeat(64)}`,
      s: `0x${"0".repeat(64)}`,
      v: 27
    };

    expect(() =>
      validateMoneriumOnrampPermit(permit, {
        expectedOwner: OWNER.address,
        expectedSpender: SPENDER,
        expectedTokenAddress: ERC20_EURE_POLYGON_V2,
        expectedTokenName: ERC20_EURE_POLYGON_TOKEN_NAME,
        expectedValueRaw: VALUE_RAW,
        network: Networks.Polygon
      })
    ).toThrow("missing signed context");
  });

  it("rejects a permit signed with a different token version", async () => {
    const permit = await signPermit({ tokenVersion: "2" });

    expect(() =>
      validateMoneriumOnrampPermit(permit, {
        expectedOwner: OWNER.address,
        expectedSpender: SPENDER,
        expectedTokenAddress: ERC20_EURE_POLYGON_V2,
        expectedTokenName: ERC20_EURE_POLYGON_TOKEN_NAME,
        expectedValueRaw: VALUE_RAW,
        network: Networks.Polygon
      })
    ).toThrow("tokenVersion");
  });
});

describe("analyzeMoneriumPermitPreflight", () => {
  it("skips sending permit when allowance already covers the self-transfer amount", async () => {
    const permit = await signPermit();

    expect(
      analyzeMoneriumPermitPreflight(
        permit,
        {
          expectedOwner: OWNER.address,
          expectedSpender: SPENDER,
          expectedTokenAddress: ERC20_EURE_POLYGON_V2,
          expectedTokenName: ERC20_EURE_POLYGON_TOKEN_NAME,
          expectedValueRaw: VALUE_RAW,
          network: Networks.Polygon
        },
        {
          allowanceRaw: 2n * BigInt(VALUE_RAW),
          balanceRaw: 0n,
          nonce: 5n,
          tokenName: ERC20_EURE_POLYGON_TOKEN_NAME
        },
        1779970000
      )
    ).toEqual({ reason: "allowance-sufficient", shouldSendPermit: false });
  });

  it("reports nonce drift before attempting a permit that would revert", async () => {
    const permit = await signPermit();

    expect(() =>
      analyzeMoneriumPermitPreflight(
        permit,
        {
          expectedOwner: OWNER.address,
          expectedSpender: SPENDER,
          expectedTokenAddress: ERC20_EURE_POLYGON_V2,
          expectedTokenName: ERC20_EURE_POLYGON_TOKEN_NAME,
          expectedValueRaw: VALUE_RAW,
          network: Networks.Polygon
        },
        {
          allowanceRaw: 0n,
          balanceRaw: BigInt(VALUE_RAW),
          nonce: 1n,
          tokenName: ERC20_EURE_POLYGON_TOKEN_NAME
        },
        1779970000
      )
    ).toThrow("nonce");
  });
});
