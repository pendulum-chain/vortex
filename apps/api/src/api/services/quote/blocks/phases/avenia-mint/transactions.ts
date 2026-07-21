import { EvmToken, EvmTransactionData, evmTokenConfig, Networks } from "@vortexfi/shared";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { encodeEvmTransactionData } from "../../../../transactions";
import { prepareBaseCleanupApproval } from "../../../../transactions/base/cleanup";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { AveniaMintMetadata } from "./simulation";

export interface AveniaMintPreparation {
  taxId?: string;
}

// AveniaMint mints BRLA onto the Base ephemeral server-side, so it needs no presigned main-lane
// tx — only the cleanup approval that lets the funding account sweep leftover BRLA dust.
export async function prepareAveniaMintTxs(ctx: PrepareCtx<AveniaMintMetadata>): Promise<PreparedPhaseTxs> {
  const brlaTokenDetails = evmTokenConfig[Networks.Base][EvmToken.BRLA];
  if (!brlaTokenDetails) {
    throw new Error("prepareAveniaMintTxs: BRLA token details not found for Base");
  }

  const fundingAccountAddress = getEvmFundingAccount(Networks.Base).address;
  const brlaCleanupApproval = await prepareBaseCleanupApproval(
    brlaTokenDetails.erc20AddressSourceChain as `0x${string}`,
    fundingAccountAddress,
    Networks.Base
  );

  return {
    intents: [
      {
        lane: "cleanup",
        network: Networks.Base,
        phase: "baseCleanupBrla",
        signer: ctx.evmEphemeral.address,
        txData: encodeEvmTransactionData(brlaCleanupApproval) as EvmTransactionData
      }
    ],
    state: { taxId: ctx.taxId }
  };
}
