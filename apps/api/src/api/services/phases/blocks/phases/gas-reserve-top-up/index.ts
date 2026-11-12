import type { Networks } from "@vortexfi/shared";
import type { StockSymbol } from "../../core/robinhood-stocks";
import type { Phase, PhaseIO } from "../../core/types";
import { GasReserveTopUpExecutor } from "./execution";
import {
  GasReserveTopUpContext,
  type GasReserveTopUpRegistrationFacts,
  type GasReserveTopUpRegistrationInput,
  registerGasReserveTopUp,
  simulateGasReserveTopUp
} from "./simulation";

export function GasReserveTopUp<Token extends StockSymbol>(
  token: Token
): Phase<
  typeof GasReserveTopUpContext,
  PhaseIO<Token, typeof Networks.Robinhood>,
  PhaseIO<Token, typeof Networks.Robinhood>,
  GasReserveTopUpRegistrationFacts,
  GasReserveTopUpRegistrationInput
> {
  return {
    context: GasReserveTopUpContext,
    executors: [new GasReserveTopUpExecutor()],
    name: `GasReserveTopUp(${token})`,
    phases: ["gasReserveTopUp"],
    register: registerGasReserveTopUp,
    simulate: simulateGasReserveTopUp
  };
}
