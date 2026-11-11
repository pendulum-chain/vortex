import type { Networks } from "@vortexfi/shared";
import type { StockSymbol } from "../../core/robinhood-stocks";
import type { Phase, PhaseIO } from "../../core/types";
import { StockSettlementExecutor } from "./execution";
import { StockSettlementContext, simulateStockSettlement } from "./simulation";
import { prepareStockSettlementTxs } from "./transactions";

export function StockSettlement<Token extends StockSymbol>(
  token: Token
): Phase<typeof StockSettlementContext, PhaseIO<Token, typeof Networks.Robinhood>, PhaseIO<Token, typeof Networks.Robinhood>> {
  return {
    context: StockSettlementContext,
    executors: [new StockSettlementExecutor()],
    name: `StockSettlement(${token})`,
    phases: ["stockSettlementTopUp"],
    prepareTxs: ctx => prepareStockSettlementTxs(ctx),
    simulate: (input, ctx) => simulateStockSettlement(token, input, ctx)
  };
}
