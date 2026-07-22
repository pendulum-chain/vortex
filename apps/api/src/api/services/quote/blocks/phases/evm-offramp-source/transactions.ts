import {
  createOfframpSquidrouterTransactionsToEvm,
  EphemeralAccountType,
  EvmToken,
  EvmTransactionData,
  evmTokenConfig,
  Networks
} from "@vortexfi/shared";
import { encodeFunctionData, erc20Abi } from "viem";
import { encodeEvmTransactionData } from "../../../../transactions";
import { requireAccount } from "../../core/accounts";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { EvmOfframpSourceRegistrationFacts } from "./registration";
import type { EvmOfframpSourceMetadata } from "./simulation";

export async function prepareEvmOfframpSourceTxs(
  ctx: PrepareCtx<EvmOfframpSourceMetadata, EvmOfframpSourceRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const facts = ctx.ownRegistrationFacts;
  if (!facts) {
    throw new Error("prepareEvmOfframpSourceTxs: Missing source registration facts");
  }
  const metadata = ctx.ownMetadata;
  const baseUsdc = evmTokenConfig[Networks.Base][EvmToken.USDC]?.erc20AddressSourceChain;
  if (!baseUsdc) {
    throw new Error("prepareEvmOfframpSourceTxs: Missing Base USDC configuration");
  }
  if (metadata.fromNetwork === Networks.Base && metadata.fromToken.toLowerCase() === baseUsdc.toLowerCase()) {
    return {
      intents: [
        {
          lane: "main",
          network: metadata.fromNetwork,
          phase: "squidRouterNoPermitTransfer",
          signer: facts.userAddress,
          txData: {
            data: encodeFunctionData({
              abi: erc20Abi,
              args: [evmEphemeral.address as `0x${string}`, BigInt(metadata.inputAmountRaw)],
              functionName: "transfer"
            }),
            gas: "0",
            to: metadata.fromToken as `0x${string}`,
            value: "0"
          }
        }
      ],
      state: { userAddress: facts.userAddress }
    };
  }
  const { approveData, swapData } = await createOfframpSquidrouterTransactionsToEvm({
    destinationAddress: evmEphemeral.address,
    fromAddress: facts.userAddress,
    fromNetwork: metadata.fromNetwork,
    fromToken: metadata.fromToken as `0x${string}`,
    rawAmount: metadata.inputAmountRaw,
    toNetwork: Networks.Base,
    toToken: baseUsdc
  });
  return {
    intents: [
      {
        lane: "main",
        network: metadata.fromNetwork,
        phase: "squidRouterApprove",
        signer: facts.userAddress,
        txData: encodeEvmTransactionData(approveData) as EvmTransactionData
      },
      {
        lane: "main",
        network: metadata.fromNetwork,
        phase: "squidRouterSwap",
        signer: facts.userAddress,
        txData: encodeEvmTransactionData(swapData) as EvmTransactionData
      }
    ],
    state: { userAddress: facts.userAddress }
  };
}
