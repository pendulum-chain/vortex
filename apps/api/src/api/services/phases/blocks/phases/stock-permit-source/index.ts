import type { Networks } from "@vortexfi/shared";
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
