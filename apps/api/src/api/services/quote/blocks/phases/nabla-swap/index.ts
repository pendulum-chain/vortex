import type { ChainBrand, Phase, PhaseIO, PrepareCtx, TokenBrand } from "../../core/types";
import { NablaApproveExecutor, NablaSwapExecutor } from "./execution";
import { simulateNablaSwap } from "./simulation";
import { prepareNablaSwapTxs } from "./transactions";

export function NablaSwap<Chain extends ChainBrand, InToken extends TokenBrand, OutToken extends TokenBrand>(
  chain: Chain,
  inToken: InToken,
  outToken: OutToken
): Phase<PhaseIO<InToken, Chain>, PhaseIO<OutToken, Chain>> {
  return {
    executors: [new NablaApproveExecutor(), new NablaSwapExecutor()],
    name: `NablaSwap(${chain}/${inToken}->${outToken})`,
    phases: ["nablaApprove", "nablaSwap"],
    prepareTxs: (ctx: PrepareCtx) => prepareNablaSwapTxs(chain, inToken, outToken, ctx),
    simulate: (input, ctx) => simulateNablaSwap(chain, inToken, outToken, input, ctx)
  };
}
