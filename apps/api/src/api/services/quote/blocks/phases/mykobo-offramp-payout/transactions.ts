import { EphemeralAccountType, EvmToken, EvmTransactionData, evmTokenConfig, Networks } from "@vortexfi/shared";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { encodeEvmTransactionData } from "../../../../transactions";
import { prepareBaseCleanupApproval } from "../../../../transactions/base/cleanup";
import { addOnrampDestinationChainTransactions } from "../../../../transactions/onramp/common/transactions";
import { requireAccount } from "../../core/accounts";
import type { PrepareCtx, PreparedPhaseTxs, TxIntent } from "../../core/types";
import type { MykoboOfframpPayoutRegistrationFacts } from "./registration";
import type { MykoboOfframpPayoutMetadata } from "./simulation";

export async function prepareMykoboOfframpPayoutTxs(
  ctx: PrepareCtx<MykoboOfframpPayoutMetadata, MykoboOfframpPayoutRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const facts = ctx.ownRegistrationFacts;
  if (!facts) throw new Error("prepareMykoboOfframpPayoutTxs: Missing Mykobo registration facts");
  const eurc = evmTokenConfig[Networks.Base][EvmToken.EURC];
  if (!eurc) throw new Error("prepareMykoboOfframpPayoutTxs: Missing Base EURC configuration");
  const payout = await addOnrampDestinationChainTransactions({
    amountRaw: ctx.ownMetadata.transferAmountRaw,
    destinationNetwork: Networks.Base,
    isNativeToken: false,
    toAddress: facts.mykoboReceivablesAddress as `0x${string}`,
    toToken: eurc.erc20AddressSourceChain as `0x${string}`
  });
  const fundingAddress = getEvmFundingAccount(Networks.Base).address;
  const cleanupIntents: TxIntent[] = [];
  for (const [token, phase] of [
    [EvmToken.USDC, "baseCleanupUsdc"],
    [EvmToken.EURC, "baseCleanupEurc"],
    [EvmToken.AXLUSDC, "baseCleanupAxlUsdc"]
  ] as const) {
    const details = evmTokenConfig[Networks.Base][token];
    if (!details) throw new Error(`prepareMykoboOfframpPayoutTxs: Missing Base ${token} configuration`);
    const approval = await prepareBaseCleanupApproval(
      details.erc20AddressSourceChain as `0x${string}`,
      fundingAddress,
      Networks.Base
    );
    cleanupIntents.push({
      lane: "cleanup",
      network: Networks.Base,
      phase,
      signer: evmEphemeral.address,
      txData: encodeEvmTransactionData(approval) as EvmTransactionData
    });
  }
  return {
    intents: [
      {
        lane: "main",
        network: Networks.Base,
        phase: "mykoboPayoutOnBase",
        signer: evmEphemeral.address,
        txData: encodeEvmTransactionData(payout) as EvmTransactionData
      },
      ...cleanupIntents
    ],
    state: { ...facts }
  };
}
