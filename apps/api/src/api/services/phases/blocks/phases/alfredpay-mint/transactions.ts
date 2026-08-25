import {
  ALFREDPAY_ERC20_TOKEN,
  EphemeralAccountType,
  ERC20_USDC_POLYGON,
  EvmNetworks,
  EvmTransactionData,
  Networks
} from "@vortexfi/shared";
import { preparePolygonCleanupApproval } from "../../../../transactions/polygon/cleanup";
import { requireAccount } from "../../core/accounts";
import { getEvmFundingAccount } from "../../core/evm-funding";
import { createDestinationTransferTransaction, encodeEvmTransactionData } from "../../core/evm-transactions";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { AlfredpayMintRegistrationFacts } from "./registration";
import type { AlfredpayMintMetadata } from "./simulation";

export interface AlfredpayMintPreparation {
  userId: string;
}

export async function prepareAlfredpayMintTxs(
  ctx: PrepareCtx<AlfredpayMintMetadata, AlfredpayMintRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  if (!ctx.ownRegistrationFacts) throw new Error("prepareAlfredpayMintTxs: Missing Alfredpay registration facts");
  const fundingAccount = getEvmFundingAccount(Networks.Polygon);
  const cleanup = await preparePolygonCleanupApproval(ERC20_USDC_POLYGON, fundingAccount.address, Networks.Polygon);
  const intents: PreparedPhaseTxs["intents"] = [
    {
      lane: "cleanup",
      network: Networks.Polygon,
      phase: "polygonCleanup",
      signer: evmEphemeral.address,
      txData: encodeEvmTransactionData(cleanup) as EvmTransactionData
    }
  ];

  if (ctx.globals.request.to !== Networks.Polygon) {
    if (!ctx.destinationAddress) {
      throw new Error("prepareAlfredpayMintTxs: Destination address is required");
    }
    const fallback = await createDestinationTransferTransaction({
      amountRaw: ctx.ownMetadata.outputAmountRaw,
      destinationNetwork: Networks.Polygon as EvmNetworks,
      toAddress: ctx.destinationAddress,
      toToken: ALFREDPAY_ERC20_TOKEN
    });
    intents.push({
      lane: "cleanup",
      network: Networks.Polygon,
      phase: "alfredOnrampMintFallback",
      signer: evmEphemeral.address,
      txData: encodeEvmTransactionData(fallback) as EvmTransactionData
    });
  }

  return {
    intents,
    state: { ...ctx.ownRegistrationFacts }
  };
}
