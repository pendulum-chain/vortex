import { type ReadMessageResult, readMessage } from "@pendulum-chain/api-solang";
import { ApiPromise } from "@polkadot/api";
import { Abi } from "@polkadot/api-contract";
import { defaultReadLimits } from "./helpers.ts";

const ALICE = "6mfqoTMHrMeVMyKwjqomUjVomPMJ4AjdCm1VReFtk7Be8wqr";

type MessageCallErrorResult = ReadMessageResult & { type: "error" | "panic" | "reverted" };

export async function contractRead<ReturnType>(params: {
  abi: Dict<unknown>;
  address: string;
  method: string;
  args: unknown[];
  api: ApiPromise;
  walletAddress?: string;
  noWalletAddressRequired?: boolean;
  parseSuccessOutput: (data: bigint[]) => ReturnType;
  parseError: string | ((error: ReadMessageResult & { type: "error" | "panic" | "reverted" }) => string);
}): Promise<ReturnType> {
  const {
    abi,
    address,
    method,
    args,
    api,
    walletAddress,
    noWalletAddressRequired = false,
    parseSuccessOutput,
    parseError
  } = params;

  if (!api || !address) {
    throw new Error("API instance and contract address are required");
  }

  const contractAbi = new Abi(abi, api.registry.getChainProperties());
  const actualWalletAddress = noWalletAddressRequired ? ALICE : walletAddress;
  if (!actualWalletAddress) {
    throw new Error("Wallet address is required");
  }

  const limits = defaultReadLimits;
  const response = await readMessage({
    abi: contractAbi,
    api,
    callerAddress: actualWalletAddress,
    contractDeploymentAddress: address,
    limits,
    messageArguments: args || [],
    messageName: method
  });
  if (response.type !== "success") {
    let message: string;
    if (typeof parseError === "string") {
      message = parseError;
    } else {
      message = parseError(response as MessageCallErrorResult);
    }
    throw new Error(message);
  }

  return parseSuccessOutput(response.value);
}
