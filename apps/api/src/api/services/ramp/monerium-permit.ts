import { getNetworkId, Networks, PermitSignature } from "@vortexfi/shared";
import { Signature as EvmSignature, verifyTypedData } from "ethers";
import httpStatus from "http-status";
import { APIError } from "../../errors/api-error";

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

export interface MoneriumPermitExpectation {
  expectedOwner: string;
  expectedSpender: string;
  expectedValueRaw: string;
  expectedTokenAddress: `0x${string}`;
  expectedTokenName: string;
  expectedTokenVersion?: string;
  network: Networks;
}

export interface MoneriumPermitDiagnostics {
  allowanceRaw: bigint;
  balanceRaw: bigint;
  nonce: bigint;
  tokenName: string;
}

function throwBadPermit(message: string): never {
  throw new APIError({
    message,
    status: httpStatus.BAD_REQUEST
  });
}

function assertEqual(label: string, actual: string | number | undefined, expected: string | number): void {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throwBadPermit(`Monerium permit ${label} ${String(actual)} does not match expected ${String(expected)}`);
  }
}

function getPermitContext(permit: PermitSignature) {
  if (!permit.context) {
    throwBadPermit("Monerium permit is missing signed context; please sign again with the latest client");
  }
  return permit.context;
}

export function validateMoneriumOnrampPermit(permit: PermitSignature, expectation: MoneriumPermitExpectation): void {
  const context = getPermitContext(permit);
  const expectedChainId = getNetworkId(expectation.network);

  assertEqual("owner", context.owner, expectation.expectedOwner);
  assertEqual("spender", context.spender, expectation.expectedSpender);
  assertEqual("valueRaw", context.valueRaw, expectation.expectedValueRaw);
  assertEqual("tokenAddress", context.tokenAddress, expectation.expectedTokenAddress);
  assertEqual("tokenName", context.tokenName, expectation.expectedTokenName);
  assertEqual("tokenVersion", context.tokenVersion, expectation.expectedTokenVersion ?? "1");
  assertEqual("chainId", context.chainId, expectedChainId);
  assertEqual("deadline", context.deadline, permit.deadline);

  const recoveredSigner = verifyTypedData(
    {
      chainId: context.chainId,
      name: context.tokenName,
      verifyingContract: context.tokenAddress,
      version: context.tokenVersion
    },
    PERMIT_TYPES,
    {
      deadline: context.deadline,
      nonce: context.nonce,
      owner: context.owner,
      spender: context.spender,
      value: context.valueRaw
    },
    EvmSignature.from({ r: permit.r, s: permit.s, v: permit.v }).serialized
  );

  if (recoveredSigner.toLowerCase() !== expectation.expectedOwner.toLowerCase()) {
    throwBadPermit(`Monerium permit signature was produced by ${recoveredSigner}, expected ${expectation.expectedOwner}`);
  }
}

export function analyzeMoneriumPermitPreflight(
  permit: PermitSignature,
  expectation: MoneriumPermitExpectation,
  diagnostics: MoneriumPermitDiagnostics,
  nowSeconds = Math.floor(Date.now() / 1000)
): { reason: "allowance-sufficient" | "permit-required"; shouldSendPermit: boolean } {
  validateMoneriumOnrampPermit(permit, expectation);

  const context = getPermitContext(permit);
  const expectedValueRaw = BigInt(expectation.expectedValueRaw);

  if (diagnostics.allowanceRaw >= expectedValueRaw) {
    return { reason: "allowance-sufficient", shouldSendPermit: false };
  }

  if (diagnostics.tokenName !== context.tokenName) {
    throwBadPermit(
      `Monerium permit tokenName ${context.tokenName} does not match on-chain token name ${diagnostics.tokenName}`
    );
  }

  if (BigInt(context.nonce) !== diagnostics.nonce) {
    throwBadPermit(
      `Monerium permit nonce ${context.nonce} does not match current on-chain nonce ${diagnostics.nonce.toString()}`
    );
  }

  if (BigInt(context.deadline) <= BigInt(nowSeconds)) {
    throwBadPermit(`Monerium permit deadline ${context.deadline} has expired`);
  }

  return { reason: "permit-required", shouldSendPermit: true };
}
