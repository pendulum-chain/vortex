import {
  EphemeralAccountType,
  EvmClientManager,
  getNetworkId,
  PRESIGNED_EVM_FEE_MULTIPLIER,
  type SignedTypedData
} from "@vortexfi/shared";
import { encodeFunctionData } from "viem";
import { requireAccount } from "../../core/accounts";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import { MONERIUM_ISSUE_NETWORKS } from "../monerium-issue/simulation";
import { MONERIUM_SELF_TRANSFER_GAS_LIMIT, moneriumPermitTypes, moneriumTransferFromAbi } from "./contract";
import type { MoneriumSelfTransferRegistrationFacts } from "./registration";
import type { MoneriumSelfTransferMetadata } from "./simulation";

const permitProbeAbi = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  { inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" }
] as const;

export interface MoneriumSelfTransferTransactionDependencies {
  now?: () => number;
  probe?: () => Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; nonce: bigint; tokenName: string }>;
}

export async function prepareMoneriumSelfTransferTxs(
  ctx: PrepareCtx<MoneriumSelfTransferMetadata, MoneriumSelfTransferRegistrationFacts>,
  dependencies: MoneriumSelfTransferTransactionDependencies = {}
): Promise<PreparedPhaseTxs> {
  const facts = ctx.ownRegistrationFacts;
  if (!facts) throw new Error("MoneriumSelfTransfer registration facts are required");
  const ephemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const tokenAddress = MONERIUM_ISSUE_NETWORKS[facts.chain].eureAddress;
  const client = EvmClientManager.getInstance().getClient(facts.chain);
  const probe = dependencies.probe
    ? await dependencies.probe()
    : await (async () => {
        const [nonce, tokenName, fees] = await Promise.all([
          client.readContract({
            abi: permitProbeAbi,
            address: tokenAddress,
            args: [facts.owner as `0x${string}`],
            functionName: "nonces"
          }),
          client.readContract({ abi: permitProbeAbi, address: tokenAddress, functionName: "name" }),
          client.estimateFeesPerGas()
        ]);
        return { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, nonce, tokenName };
      })();
  const chainId = getNetworkId(facts.chain);
  if (chainId === undefined) throw new Error(`MoneriumSelfTransfer requires the ${facts.chain} chain ID`);
  const deadline = BigInt(Math.floor((dependencies.now?.() ?? Date.now()) / 1000) + 24 * 60 * 60);
  const permit: SignedTypedData = {
    domain: { chainId, name: probe.tokenName, verifyingContract: tokenAddress, version: "1" },
    message: {
      deadline: deadline.toString(),
      nonce: probe.nonce.toString(),
      owner: facts.owner,
      spender: ephemeral.address,
      value: facts.amountRaw
    },
    primaryType: "Permit",
    types: moneriumPermitTypes
  };
  const nativeExecutionBudget = MONERIUM_SELF_TRANSFER_GAS_LIMIT * probe.maxFeePerGas * PRESIGNED_EVM_FEE_MULTIPLIER;

  return {
    intents: [
      {
        lane: "main",
        network: facts.chain,
        phase: "moneriumOnrampSelfTransfer",
        signer: facts.owner,
        txData: permit
      },
      {
        lane: "main",
        network: facts.chain,
        phase: "moneriumOnrampSelfTransfer",
        prefundNativeValueRaw: nativeExecutionBudget.toString(),
        signer: ephemeral.address,
        txData: {
          data: encodeFunctionData({
            abi: moneriumTransferFromAbi,
            args: [facts.owner as `0x${string}`, ephemeral.address as `0x${string}`, BigInt(facts.amountRaw)],
            functionName: "transferFrom"
          }),
          gas: MONERIUM_SELF_TRANSFER_GAS_LIMIT.toString(),
          maxFeePerGas: probe.maxFeePerGas.toString(),
          maxPriorityFeePerGas: probe.maxPriorityFeePerGas.toString(),
          to: tokenAddress,
          value: "0"
        }
      }
    ],
    state: facts
  };
}
