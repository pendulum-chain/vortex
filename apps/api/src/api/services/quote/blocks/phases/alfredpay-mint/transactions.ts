import { ALFREDPAY_ERC20_TOKEN, ERC20_USDC_POLYGON, EvmNetworks, EvmTransactionData, Networks } from "@vortexfi/shared";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { encodeEvmTransactionData } from "../../../../transactions";
import { addOnrampDestinationChainTransactions } from "../../../../transactions/onramp/common/transactions";
import { preparePolygonCleanupApproval } from "../../../../transactions/polygon/cleanup";
import { resolveAlfredpayCustomerId } from "../../../alfredpay-customer";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { AlfredpayMintMetadata } from "./simulation";

export interface AlfredpayMintPreparation {
  userId: string;
}

export async function prepareAlfredpayMintTxs(ctx: PrepareCtx<AlfredpayMintMetadata>): Promise<PreparedPhaseTxs> {
  if (!ctx.userId) {
    throw new Error("prepareAlfredpayMintTxs: User ID is required");
  }
  const fundingAccount = getEvmFundingAccount(Networks.Polygon);
  const cleanup = await preparePolygonCleanupApproval(ERC20_USDC_POLYGON, fundingAccount.address, Networks.Polygon);
  const fallback = await addOnrampDestinationChainTransactions({
    amountRaw: ctx.ownMetadata.outputAmountRaw,
    destinationNetwork: Networks.Polygon as EvmNetworks,
    toAddress: ctx.destinationAddress,
    toToken: ALFREDPAY_ERC20_TOKEN
  });
  const alfredpayUserId = await resolveAlfredpayCustomerId(ctx.ownMetadata.currency, ctx.userId);

  return {
    intents: [
      {
        lane: "cleanup",
        network: Networks.Polygon,
        phase: "polygonCleanup",
        signer: ctx.evmEphemeral.address,
        txData: encodeEvmTransactionData(cleanup) as EvmTransactionData
      },
      {
        lane: "cleanup",
        network: Networks.Polygon,
        phase: "alfredOnrampMintFallback",
        signer: ctx.evmEphemeral.address,
        txData: encodeEvmTransactionData(fallback) as EvmTransactionData
      }
    ],
    state: { userId: alfredpayUserId }
  };
}
