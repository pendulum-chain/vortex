import {
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  createNablaTransactionsForOnrampOnEVM,
  EphemeralAccountType,
  EvmNetworks,
  EvmToken,
  EvmTransactionData,
  evmTokenConfig,
  getNablaBasePool,
  Networks
} from "@vortexfi/shared";
import Big from "big.js";
import { config } from "../../../../../../config/vars";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { encodeEvmTransactionData } from "../../../../transactions";
import { prepareBaseCleanupApproval } from "../../../../transactions/base/cleanup";
import { requireAccount } from "../../core/accounts";
import type { ChainBrand, PrepareCtx, PreparedPhaseTxs, TokenBrand } from "../../core/types";
import type { NablaSwapMetadata } from "./simulation";

export interface NablaSwapPreparation {
  softMinimumOutputRaw: string;
}

// The presigned approve+swap the NablaApprove/NablaSwap executors broadcast, plus the cleanup
// approval sweeping leftover swap-output dust. Reads only this phase's own simulated metadata.
export async function prepareNablaSwapTxs(
  chain: ChainBrand,
  inToken: TokenBrand,
  outToken: TokenBrand,
  ctx: PrepareCtx<NablaSwapMetadata>,
  includeCleanup = true
): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const { ownMetadata } = ctx;

  const inputTokenDetails = evmTokenConfig[chain as EvmNetworks]?.[inToken as EvmToken];
  const outputTokenDetails = evmTokenConfig[chain as EvmNetworks]?.[outToken as EvmToken];
  if (!inputTokenDetails || !outputTokenDetails) {
    throw new Error(`prepareNablaSwapTxs: Missing token config for ${inToken} or ${outToken} on ${chain}`);
  }

  const inputAmountForNablaSwapRaw = ownMetadata.inputAmountForSwapRaw;
  // For offramps, outputAmountRaw may include a partner subsidy; use the AMM-only amount when
  // available so the on-chain minimum reflects what the AMM can actually deliver.
  const minOutputBaseRaw = ownMetadata.ammOutputAmountRaw ?? ownMetadata.outputAmountRaw;

  const nablaSoftMinimumOutputRaw = Big(minOutputBaseRaw)
    .mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN)
    .toFixed(0, 0);
  const nablaHardMinimumOutputRaw = Big(minOutputBaseRaw)
    .mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN)
    .toFixed(0, 0);

  const { approve, swap } = await createNablaTransactionsForOnrampOnEVM(
    inputAmountForNablaSwapRaw,
    evmEphemeral,
    inputTokenDetails.erc20AddressSourceChain,
    outputTokenDetails.erc20AddressSourceChain,
    nablaHardMinimumOutputRaw,
    config.swap.deadlineMinutes,
    getNablaBasePool(inputTokenDetails.erc20AddressSourceChain, outputTokenDetails.erc20AddressSourceChain).router
  );

  const cleanupIntent = includeCleanup
    ? {
        lane: "cleanup" as const,
        network: chain as Networks,
        phase: "baseCleanupUsdc" as const,
        signer: evmEphemeral.address,
        txData: encodeEvmTransactionData(
          await prepareBaseCleanupApproval(
            outputTokenDetails.erc20AddressSourceChain as `0x${string}`,
            getEvmFundingAccount(chain as EvmNetworks).address,
            chain as EvmNetworks
          )
        ) as EvmTransactionData
      }
    : undefined;

  return {
    intents: [
      {
        lane: "main",
        network: chain as Networks,
        phase: "nablaApprove",
        signer: evmEphemeral.address,
        txData: approve
      },
      {
        lane: "main",
        network: chain as Networks,
        phase: "nablaSwap",
        signer: evmEphemeral.address,
        txData: swap
      },
      ...(cleanupIntent ? [cleanupIntent] : [])
    ],
    state: { softMinimumOutputRaw: nablaSoftMinimumOutputRaw }
  };
}
