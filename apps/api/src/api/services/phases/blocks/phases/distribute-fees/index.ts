import { type EvmNetworks, EvmToken, Networks } from "@vortexfi/shared";
import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { DistributeFeesExecutor } from "./execution";
import { DistributeFeesContext, simulateDistributeFees } from "./simulation";
import { prepareDistributeFeesTxs } from "./transactions";

export interface DistributeFeesConfig {
  /** Network the fee transfers execute on. Defaults to Base. */
  network?: EvmNetworks;
  /** ERC-20 the fees are paid in on that network. Defaults to USDC. */
  feeToken?: EvmToken;
  /**
   * Whether the simulation deducts the platform fee from the flowing amount.
   * Corridors that already deduct it elsewhere (Alfredpay subtracts in
   * AlfredpaySubsidizePre / AlfredpayOfframp) pass false so the fee is not
   * charged twice; the block then only prepares and broadcasts the transfers.
   */
  deductFromAmount?: boolean;
}

export function DistributeFees<Token extends TokenBrand, Chain extends ChainBrand>(
  config: DistributeFeesConfig = {}
): Phase<typeof DistributeFeesContext, PhaseIO<Token, Chain>, PhaseIO<Token, Chain>> {
  const network = config.network ?? (Networks.Base as EvmNetworks);
  const feeToken = config.feeToken ?? EvmToken.USDC;
  const deductFromAmount = config.deductFromAmount ?? true;
  return {
    context: DistributeFeesContext,
    executors: [new DistributeFeesExecutor()],
    name: "DistributeFees",
    phases: ["distributeFees"],
    prepareTxs: ctx => prepareDistributeFeesTxs(ctx, network, feeToken),
    simulate: (input, ctx) => simulateDistributeFees(input, ctx, { deductFromAmount, feeToken, network })
  };
}
