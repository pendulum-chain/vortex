import { ERC20_EURE_POLYGON_V2 } from "@vortexfi/shared";
import { decodeFunctionData, isAddress, parseTransaction, recoverTransactionAddress } from "viem";

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
  expectedChainId?: number;
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

function requireAddress(value: string | null | undefined, label: string, rampId: string): `0x${string}` {
  if (!value || !isAddress(value)) {
    throw new Error(`[${rampId}] ${label} ${value ?? "<missing>"} is not a valid EVM address`);
  }

  return value as `0x${string}`;
}

interface MoneriumSelfTransferInspectionDependencies {
  decodeFunctionData: typeof decodeFunctionData;
  parseTransaction: typeof parseTransaction;
  recoverTransactionAddress: typeof recoverTransactionAddress;
}

const defaultMoneriumSelfTransferInspectionDependencies: MoneriumSelfTransferInspectionDependencies = {
  decodeFunctionData,
  parseTransaction,
  recoverTransactionAddress
};

export async function inspectMoneriumSelfTransferTransaction(
  txData: string,
  expectation: MoneriumSelfTransferExpectation,
  dependencies: MoneriumSelfTransferInspectionDependencies = defaultMoneriumSelfTransferInspectionDependencies
): Promise<MoneriumSelfTransferInspection> {
  const serializedTransaction = txData as RecoverableSerializedTransaction;
  const parsedTx = dependencies.parseTransaction(serializedTransaction);
  const signer = requireAddress(
    await dependencies.recoverTransactionAddress({ serializedTransaction }),
    "Self-transfer signer",
    expectation.rampId
  );
  const expectedTokenAddress = expectation.expectedTokenAddress ?? ERC20_EURE_POLYGON_V2;
  const transactionTokenAddress = requireAddress(parsedTx.to, "Self-transfer token", expectation.rampId);
  const signedNonce = parsedTx.nonce;

  if (signedNonce === undefined) {
    throw new Error(`[${expectation.rampId}] Self-transfer signed transaction is missing a nonce`);
  }

  if (signer.toLowerCase() !== expectation.expectedSigner.toLowerCase()) {
    throw new Error(
      `[${expectation.rampId}] Self-transfer signer ${signer} does not match expected EVM ephemeral ${expectation.expectedSigner}`
    );
  }

  if (transactionTokenAddress.toLowerCase() !== expectedTokenAddress.toLowerCase()) {
    throw new Error(
      `[${expectation.rampId}] Self-transfer token ${transactionTokenAddress} does not match expected ${expectedTokenAddress}`
    );
  }

  if (expectation.expectedChainId !== undefined && parsedTx.chainId !== expectation.expectedChainId) {
    throw new Error(
      `[${expectation.rampId}] Self-transfer chainId ${parsedTx.chainId} does not match expected ${expectation.expectedChainId}`
    );
  }

  let decodedTransfer;
  try {
    decodedTransfer = dependencies.decodeFunctionData({
      abi: moneriumTransferFromAbi,
      data: parsedTx.data ?? "0x"
    });
  } catch (error) {
    throw new Error(
      `[${expectation.rampId}] Self-transfer calldata is not a valid transferFrom payload: ${error instanceof Error ? error.message : error}`
    );
  }
  const [decodedOwner, decodedRecipient, amountRaw] = decodedTransfer.args;
  const owner = requireAddress(decodedOwner, "Self-transfer owner", expectation.rampId);
  const recipient = requireAddress(decodedRecipient, "Self-transfer recipient", expectation.rampId);
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
    tokenAddress: transactionTokenAddress
  };
}
