import { ERC20_EURE_POLYGON_V2 } from "@vortexfi/shared";
import { decodeFunctionData, parseTransaction, recoverTransactionAddress } from "viem";

export const moneriumTransferFromAbi = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" }
    ],
    name: "transferFrom",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

type RecoverableSerializedTransaction = Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"];

interface MoneriumSelfTransferExpectation {
  expectedAmountRaw: string;
  expectedOwner: `0x${string}`;
  expectedRecipient: `0x${string}`;
  expectedSigner: `0x${string}`;
  expectedTokenAddress?: `0x${string}`;
  rampId: string;
}

export interface MoneriumSelfTransferInspection {
  amountRaw: bigint;
  owner: `0x${string}`;
  recipient: `0x${string}`;
  serializedTransaction: RecoverableSerializedTransaction;
  signedGas: bigint;
  signedNonce: number;
  signer: `0x${string}`;
  tokenAddress: `0x${string}`;
}

export async function inspectMoneriumSelfTransferTransaction(
  txData: string,
  expectation: MoneriumSelfTransferExpectation
): Promise<MoneriumSelfTransferInspection> {
  const serializedTransaction = txData as RecoverableSerializedTransaction;
  const parsedTx = parseTransaction(serializedTransaction);
  const signer = await recoverTransactionAddress({ serializedTransaction });
  const tokenAddress = expectation.expectedTokenAddress ?? ERC20_EURE_POLYGON_V2;
  const signedNonce = parsedTx.nonce;

  if (signedNonce === undefined) {
    throw new Error(`[${expectation.rampId}] Self-transfer signed transaction is missing a nonce`);
  }

  if (signer.toLowerCase() !== expectation.expectedSigner.toLowerCase()) {
    throw new Error(
      `[${expectation.rampId}] Self-transfer signer ${signer} does not match expected EVM ephemeral ${expectation.expectedSigner}`
    );
  }

  if (parsedTx.to?.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(`[${expectation.rampId}] Self-transfer token ${parsedTx.to} does not match expected ${tokenAddress}`);
  }

  const decodedTransfer = decodeFunctionData({
    abi: moneriumTransferFromAbi,
    data: parsedTx.data ?? "0x"
  });
  const [owner, recipient, amountRaw] = decodedTransfer.args;
  const expectedAmount = BigInt(expectation.expectedAmountRaw);

  if (owner.toLowerCase() !== expectation.expectedOwner.toLowerCase()) {
    throw new Error(
      `[${expectation.rampId}] Self-transfer owner ${owner} does not match expected ${expectation.expectedOwner}`
    );
  }
  if (recipient.toLowerCase() !== expectation.expectedRecipient.toLowerCase()) {
    throw new Error(
      `[${expectation.rampId}] Self-transfer recipient ${recipient} does not match expected ${expectation.expectedRecipient}`
    );
  }
  if (amountRaw !== expectedAmount) {
    throw new Error(
      `[${expectation.rampId}] Self-transfer amount ${amountRaw.toString()} does not match expected ${expectation.expectedAmountRaw}`
    );
  }

  return {
    amountRaw,
    owner,
    recipient,
    serializedTransaction,
    signedGas: parsedTx.gas ?? 0n,
    signedNonce,
    signer,
    tokenAddress
  };
}
