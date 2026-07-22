import { EphemeralAccountType, EvmToken, EvmTransactionData, evmTokenConfig, Networks } from "@vortexfi/shared";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { encodeEvmTransactionData } from "../../../../transactions";
import { prepareBaseCleanupApproval } from "../../../../transactions/base/cleanup";
import { addOnrampDestinationChainTransactions } from "../../../../transactions/onramp/common/transactions";
import { requireAccount } from "../../core/accounts";
import type { PrepareCtx, PreparedPhaseTxs, TxIntent } from "../../core/types";
import type { AveniaOfframpPayoutRegistrationFacts } from "./registration";
import type { AveniaOfframpPayoutMetadata } from "./simulation";

export async function prepareAveniaOfframpPayoutTxs(
  ctx: PrepareCtx<AveniaOfframpPayoutMetadata, AveniaOfframpPayoutRegistrationFacts>
): Promise<PreparedPhaseTxs> {
  const evmEphemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const facts = ctx.ownRegistrationFacts;
  if (!facts) {
    throw new Error("prepareAveniaOfframpPayoutTxs: Missing Avenia registration facts");
  }
  const brla = evmTokenConfig[Networks.Base][EvmToken.BRLA];
  if (!brla) {
    throw new Error("prepareAveniaOfframpPayoutTxs: Missing Base BRLA configuration");
  }
  const payout = await addOnrampDestinationChainTransactions({
    amountRaw: ctx.ownMetadata.transferAmountRaw,
    destinationNetwork: Networks.Base,
    isNativeToken: false,
    toAddress: facts.brlaEvmAddress,
    toToken: brla.erc20AddressSourceChain as `0x${string}`
  });
  const fundingAddress = getEvmFundingAccount(Networks.Base).address;
  const cleanupTokens = [
    [EvmToken.USDC, "baseCleanupUsdc"],
    [EvmToken.BRLA, "baseCleanupBrla"],
    [EvmToken.AXLUSDC, "baseCleanupAxlUsdc"]
  ] as const;
  const cleanupIntents: TxIntent[] = [];
  for (const [token, phase] of cleanupTokens) {
    const details = evmTokenConfig[Networks.Base][token];
    if (!details) {
      throw new Error(`prepareAveniaOfframpPayoutTxs: Missing Base ${token} configuration`);
    }
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
        phase: "brlaPayoutOnBase",
        signer: evmEphemeral.address,
        txData: encodeEvmTransactionData(payout) as EvmTransactionData
      },
      ...cleanupIntents
    ],
    state: { ...facts }
  };
}
