import { type PresignedTx, type SignedTypedData } from "@vortexfi/shared";
import { Signature as EvmSignature, verifyTypedData } from "ethers";
import { decodeFunctionData, getAddress, parseTransaction, recoverTransactionAddress } from "viem";
import { moneriumPermitTypes, moneriumTransferFromAbi } from "./contract";

export interface MoneriumTransferExpectation {
  amountRaw: string;
  chainId: number;
  owner: `0x${string}`;
  recipient: `0x${string}`;
  signer: `0x${string}`;
  tokenAddress: `0x${string}`;
}

export interface ValidatedMoneriumPermit {
  deadline: bigint;
  nonce: bigint;
  signature: { r: `0x${string}`; s: `0x${string}`; v: number };
}

function sameAddress(left: unknown, right: string): boolean {
  return typeof left === "string" && getAddress(left) === getAddress(right);
}

function requireSingleSignature(typedData: SignedTypedData): { r: `0x${string}`; s: `0x${string}`; v: number } {
  const signature = typedData.signature;
  if (!signature || Array.isArray(signature)) throw new Error("Monerium permit requires exactly one signature");
  return signature;
}

function requireSingleTypedData(txData: PresignedTx["txData"]): SignedTypedData {
  const typedData = Array.isArray(txData) ? txData : [txData];
  if (typedData.length !== 1 || !typedData[0] || typeof typedData[0] !== "object" || !("domain" in typedData[0])) {
    throw new Error("Monerium permit transaction must contain exactly one EIP-712 typed-data payload");
  }
  return typedData[0] as SignedTypedData;
}

export function validateMoneriumPermit(
  signedTx: PresignedTx,
  unsignedTx: PresignedTx,
  expectation: MoneriumTransferExpectation
): ValidatedMoneriumPermit {
  const signed = requireSingleTypedData(signedTx.txData);
  const unsigned = requireSingleTypedData(unsignedTx.txData);
  if (
    signedTx.phase !== "moneriumOnrampSelfTransfer" ||
    signedTx.network !== unsignedTx.network ||
    signedTx.nonce !== unsignedTx.nonce ||
    !sameAddress(signedTx.signer, expectation.owner) ||
    !sameAddress(unsignedTx.signer, expectation.owner)
  ) {
    throw new Error("Monerium permit transaction identity does not match its blueprint");
  }
  const fields = ["owner", "spender", "value", "nonce", "deadline"] as const;
  if (
    signed.primaryType !== "Permit" ||
    unsigned.primaryType !== "Permit" ||
    signed.domain.chainId !== expectation.chainId ||
    unsigned.domain.chainId !== expectation.chainId ||
    !sameAddress(signed.domain.verifyingContract, expectation.tokenAddress) ||
    !sameAddress(unsigned.domain.verifyingContract, expectation.tokenAddress) ||
    typeof signed.domain.name !== "string" ||
    signed.domain.name.length === 0 ||
    signed.domain.name !== unsigned.domain.name ||
    signed.domain.version !== "1" ||
    unsigned.domain.version !== "1" ||
    !fields.every(field => String(signed.message[field]) === String(unsigned.message[field])) ||
    JSON.stringify(signed.types) !== JSON.stringify(moneriumPermitTypes) ||
    JSON.stringify(unsigned.types) !== JSON.stringify(moneriumPermitTypes)
  ) {
    throw new Error("Signed Monerium permit does not match its server-issued blueprint");
  }
  if (
    !sameAddress(signed.message.owner, expectation.owner) ||
    !sameAddress(signed.message.spender, expectation.recipient) ||
    String(signed.message.value) !== expectation.amountRaw
  ) {
    throw new Error("Monerium permit authority or amount does not match registration");
  }
  const deadline = BigInt(String(signed.message.deadline));
  const signature = requireSingleSignature(signed);
  const recovered = verifyTypedData(signed.domain, signed.types, signed.message, EvmSignature.from(signature).serialized);
  if (!sameAddress(recovered, expectation.owner)) {
    throw new Error(`Monerium permit signature was produced by ${recovered}, expected ${expectation.owner}`);
  }
  return { deadline, nonce: BigInt(String(signed.message.nonce)), signature };
}

export async function validateMoneriumTransfer(
  signedTx: PresignedTx,
  expectation: MoneriumTransferExpectation
): Promise<{ hashInput: `0x${string}`; nonce: number }> {
  if (typeof signedTx.txData !== "string") throw new Error("Monerium transferFrom must be a signed raw transaction");
  const hashInput = signedTx.txData as `0x${string}`;
  const parsed = parseTransaction(hashInput);
  const signer = await recoverTransactionAddress({
    serializedTransaction: hashInput as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"]
  });
  if (
    parsed.chainId !== expectation.chainId ||
    parsed.nonce === undefined ||
    !sameAddress(signer, expectation.signer) ||
    !sameAddress(parsed.to, expectation.tokenAddress)
  ) {
    throw new Error("Monerium transferFrom signer, chain, or token does not match registration");
  }
  const decoded = decodeFunctionData({ abi: moneriumTransferFromAbi, data: parsed.data ?? "0x" });
  const [owner, recipient, amount] = decoded.args;
  if (
    decoded.functionName !== "transferFrom" ||
    !sameAddress(owner, expectation.owner) ||
    !sameAddress(recipient, expectation.recipient) ||
    amount !== BigInt(expectation.amountRaw)
  ) {
    throw new Error("Monerium transferFrom calldata does not match registration");
  }
  return { hashInput, nonce: parsed.nonce };
}
