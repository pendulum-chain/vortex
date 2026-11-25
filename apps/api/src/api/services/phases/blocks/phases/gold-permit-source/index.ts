import { EvmToken, type Networks } from "@vortexfi/shared";
import { GOLD_TOKEN } from "../../core/gold-base";
import type { Phase, PhaseIO } from "../../core/types";
import { StockPermitTransferExecutor } from "../stock-permit-source/execution";
import {
  registerStockPermitSource,
  type StockPermitSourceRegistrationFacts,
  type StockPermitSourceRegistrationInput
} from "../stock-permit-source/registration";
import { GoldPermitSourceContext, type PermitSourceContext } from "../stock-permit-source/simulation";
import { prepareStockPermitSourceTxs } from "../stock-permit-source/transactions";
import { type GoldSourceToken, simulateGoldPermitSource } from "./simulation";

/** The stock permit executor under Gold's own phase and block state, so the two products never share a lock or a row. */
export class GoldPermitTransferExecutor extends StockPermitTransferExecutor {
  protected override get context(): PermitSourceContext {
    return GoldPermitSourceContext;
  }
}

function goldPermitSource<Token extends GoldSourceToken>(
  token: Token
): Phase<
  typeof GoldPermitSourceContext,
  PhaseIO<Token, typeof Networks.Base>,
  PhaseIO<Token, typeof Networks.Base>,
  StockPermitSourceRegistrationFacts,
  StockPermitSourceRegistrationInput
> {
  return {
    context: GoldPermitSourceContext,
    executors: [new GoldPermitTransferExecutor()],
    name: `GoldPermitSource(${token})`,
    phases: ["goldPermitTransfer"],
    prepareTxs: ctx => prepareStockPermitSourceTxs(ctx, {}, GoldPermitSourceContext),
    register: ctx => registerStockPermitSource(ctx, GoldPermitSourceContext),
    simulate: (input, ctx) => simulateGoldPermitSource(token, input, ctx)
  };
}

/** The buyer's native USDC on Base, pulled onto the ephemeral with one exact-value permit. */
export const GoldUsdcSource = () => goldPermitSource(EvmToken.USDC);
/** The seller's PAXG on Base, pulled the same way. */
export const GoldPaxgSource = () => goldPermitSource(GOLD_TOKEN);
