import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { DestinationTransferExecutor } from "./execution";
import { simulateDestinationTransfer } from "./simulation";
import { prepareDestinationTransferTxs } from "./transactions";

export function DestinationTransfer<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    executors: [new DestinationTransferExecutor()],
    name: "DestinationTransfer",
    phases: ["destinationTransfer"],
    prepareTxs: prepareDestinationTransferTxs,
    simulate: simulateDestinationTransfer
  };
}
