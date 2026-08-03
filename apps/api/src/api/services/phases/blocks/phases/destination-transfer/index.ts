import type { ChainBrand, Phase, PhaseIO, TokenBrand } from "../../core/types";
import { DestinationTransferExecutor } from "./execution";
import { DestinationTransferContext, simulateDestinationTransfer } from "./simulation";
import { prepareDestinationTransferTxs } from "./transactions";

export function DestinationTransfer<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  typeof DestinationTransferContext,
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    context: DestinationTransferContext,
    executors: [new DestinationTransferExecutor()],
    name: "DestinationTransfer",
    phases: ["destinationTransfer"],
    prepareTxs: prepareDestinationTransferTxs,
    simulate: simulateDestinationTransfer
  };
}
