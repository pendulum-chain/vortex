import { EvmToken, Networks } from "@vortexfi/shared";
import type { StockSymbol } from "../../core/robinhood-stocks";
import type { Phase, PhaseIO } from "../../core/types";
import { StockPermitTransferExecutor } from "./execution";
import {
  registerStockPermitSource,
  type StockPermitSourceRegistrationFacts,
  type StockPermitSourceRegistrationInput
} from "./registration";
import { StockPermitSourceContext, simulateStockPermitSource } from "./simulation";
import { prepareStockPermitSourceTxs } from "./transactions";

export function StockPermitSource<Token extends StockSymbol>(
  token: Token
): Phase<
  typeof StockPermitSourceContext,
  PhaseIO<Token, typeof Networks.Robinhood>,
  PhaseIO<Token, typeof Networks.Robinhood>,
  StockPermitSourceRegistrationFacts,
  StockPermitSourceRegistrationInput
> {
  return {
    context: StockPermitSourceContext,
    executors: [new StockPermitTransferExecutor()],
    name: `StockPermitSource(${token})`,
    phases: ["stockPermitTransfer"],
    prepareTxs: prepareStockPermitSourceTxs,
    register: registerStockPermitSource,
    simulate: (input, ctx) => simulateStockPermitSource(token, input, ctx)
  };
}

export function BaseUsdcStockSource(): Phase<
  typeof StockPermitSourceContext,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
  StockPermitSourceRegistrationFacts,
  StockPermitSourceRegistrationInput
> {
  return {
    context: StockPermitSourceContext,
    executors: [new StockPermitTransferExecutor()],
    name: "BaseUsdcStockSource",
    phases: ["stockPermitTransfer"],
    prepareTxs: prepareStockPermitSourceTxs,
    register: registerStockPermitSource,
    simulate: (input, ctx) => simulateStockPermitSource(EvmToken.USDC, input, ctx)
  };
}
