import type {
  EIP712TypedData,
  SignEvmTransactionOptions,
  SignEvmTransactionResult,
  SignEvmTypedDataOptions,
  SignEvmTypedDataResult
} from "@coinbase/cdp-core";
import type { SignedTypedData } from "@vortexfi/shared";
import type { Hex } from "viem";
import {
  estimateFeesPerGas,
  estimateGas,
  getGasPrice,
  getPublicClient,
  getTransactionCount,
  waitForTransactionReceipt
} from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi";
import type { WalletSigningAdapter, WalletTransactionRequest } from "./signingAdapter";

interface CdpSigningFunctions {
  signTransaction: (options: SignEvmTransactionOptions) => Promise<SignEvmTransactionResult>;
  signTypedData: (options: SignEvmTypedDataOptions) => Promise<SignEvmTypedDataResult>;
}

type EvmAddress = `0x${string}`;

function toCdpTypedData(typedData: SignedTypedData): EIP712TypedData {
  const domain = {
    ...(typedData.domain.chainId !== undefined ? { chainId: Number(typedData.domain.chainId) } : {}),
    ...(typedData.domain.name ? { name: typedData.domain.name } : {}),
    ...(typedData.domain.salt ? { salt: typedData.domain.salt } : {}),
    ...(typedData.domain.verifyingContract ? { verifyingContract: typedData.domain.verifyingContract } : {}),
    ...(typedData.domain.version ? { version: typedData.domain.version } : {})
  };
  const domainFields: Array<{ name: string; type: string }> = [];
  if (domain.name !== undefined) domainFields.push({ name: "name", type: "string" });
  if (domain.version !== undefined) domainFields.push({ name: "version", type: "string" });
  if (domain.chainId !== undefined) domainFields.push({ name: "chainId", type: "uint256" });
  if (domain.verifyingContract !== undefined) domainFields.push({ name: "verifyingContract", type: "address" });
  if (domain.salt !== undefined) domainFields.push({ name: "salt", type: "bytes32" });

  return {
    domain,
    message: typedData.message,
    primaryType: typedData.primaryType,
    types: { EIP712Domain: domainFields, ...typedData.types }
  };
}

async function prepareTransaction(address: EvmAddress, transaction: WalletTransactionRequest) {
  const [nonce, gas, estimatedFees] = await Promise.all([
    transaction.nonce ?? getTransactionCount(wagmiConfig, { address, blockTag: "pending", chainId: transaction.chainId }),
    transaction.gas && transaction.gas > 0n
      ? transaction.gas
      : estimateGas(wagmiConfig, {
          account: address,
          chainId: transaction.chainId,
          data: transaction.data,
          to: transaction.to,
          value: transaction.value
        }),
    transaction.maxFeePerGas !== undefined && transaction.maxPriorityFeePerGas !== undefined
      ? undefined
      : estimateFeesPerGas(wagmiConfig, { chainId: transaction.chainId })
  ]);

  let maxFeePerGas = transaction.maxFeePerGas ?? estimatedFees?.maxFeePerGas;
  let maxPriorityFeePerGas = transaction.maxPriorityFeePerGas ?? estimatedFees?.maxPriorityFeePerGas;
  if ((transaction.chainId === 56 || transaction.chainId === 97) && (!maxPriorityFeePerGas || maxPriorityFeePerGas === 0n)) {
    const gasPrice = await getGasPrice(wagmiConfig, { chainId: transaction.chainId });
    maxPriorityFeePerGas = gasPrice;
    maxFeePerGas = maxFeePerGas && maxFeePerGas > gasPrice ? maxFeePerGas : gasPrice;
  }
  if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined) {
    throw new Error(`Could not determine EIP-1559 fees for chain ${transaction.chainId}`);
  }

  return {
    chainId: transaction.chainId,
    data: transaction.data,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
    to: transaction.to as EvmAddress,
    type: "eip1559" as const,
    value: transaction.value
  };
}

export function createCdpSigningAdapter(
  address: EvmAddress,
  { signTransaction, signTypedData }: CdpSigningFunctions
): WalletSigningAdapter {
  return {
    address,
    kind: "cdp_embedded",
    sendTransaction: async transaction => {
      const result = await signTransaction({
        evmAccount: address,
        transaction: await prepareTransaction(address, transaction)
      });
      const publicClient = getPublicClient(wagmiConfig, { chainId: transaction.chainId });
      if (!publicClient) throw new Error(`No public client configured for chain ${transaction.chainId}`);
      return publicClient.sendRawTransaction({ serializedTransaction: result.signedTransaction });
    },
    signTypedData: async typedData => {
      const result = await signTypedData({
        evmAccount: address,
        typedData: toCdpTypedData(typedData)
      });
      return result.signature as Hex;
    },
    waitForTransaction: async (hash, chainId) => {
      const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId, hash });
      return receipt.transactionHash;
    }
  };
}
