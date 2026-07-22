import {
  EphemeralAccountType,
  EvmToken,
  EvmTransactionData,
  evmTokenConfig,
  getNetworkFromDestination,
  Networks
} from "@vortexfi/shared";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { encodeEvmTransactionData } from "../../../../transactions";
import { prepareBaseCleanupApproval } from "../../../../transactions/base/cleanup";
import { requireAccount } from "../../core/accounts";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import type { MykoboMintRegistrationFacts } from "./registration";
import type { MykoboMintMetadata } from "./simulation";

export type MykoboMintPreparation = MykoboMintRegistrationFacts;

export async function prepareMykoboMintTxs(
  ctx: PrepareCtx<MykoboMintMetadata, MykoboMintRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  if (!ctx.ownRegistrationFacts) {
    throw new Error("prepareMykoboMintTxs: Missing Mykobo registration facts");
  }
  const isDirectTransfer =
    ctx.globals.request.outputCurrency === EvmToken.EURC && getNetworkFromDestination(ctx.globals.request.to) === Networks.Base;
  if (isDirectTransfer) {
    return { intents: [], state: { ...ctx.ownRegistrationFacts } };
  }
  const eurc = evmTokenConfig[Networks.Base][EvmToken.EURC];
  if (!eurc) {
    throw new Error("prepareMykoboMintTxs: EURC token details not found for Base");
  }
  const cleanup = await prepareBaseCleanupApproval(
    eurc.erc20AddressSourceChain as `0x${string}`,
    getEvmFundingAccount(Networks.Base).address,
    Networks.Base
  );
  return {
    intents: [
      {
        lane: "cleanup",
        network: Networks.Base,
        phase: "baseCleanupEurc",
        signer: evmEphemeral.address,
        txData: encodeEvmTransactionData(cleanup) as EvmTransactionData
      }
    ],
    state: { ...ctx.ownRegistrationFacts }
  };
}
