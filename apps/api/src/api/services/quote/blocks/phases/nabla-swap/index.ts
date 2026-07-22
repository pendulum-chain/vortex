import type { ChainBrand, Phase, PhaseIO, PrepareCtx, TokenBrand } from "../../core/types";
import { NablaApproveExecutor, NablaSwapExecutor } from "./execution";
import { NablaSwapContext, type NablaSwapMetadata, simulateNablaSwap } from "./simulation";
import { prepareNablaSwapTxs } from "./transactions";

export function NablaSwap<Chain extends ChainBrand, InToken extends TokenBrand, OutToken extends TokenBrand>(
  chain: Chain,
  inToken: InToken,
  outToken: OutToken,
  options: { cleanup?: boolean } = {}
): Phase<typeof NablaSwapContext, PhaseIO<InToken, Chain>, PhaseIO<OutToken, Chain>> {
  return {
    context: NablaSwapContext,
    executors: [new NablaApproveExecutor(), new NablaSwapExecutor()],
    name: `NablaSwap(${chain}/${inToken}->${outToken})`,
    phases: ["nablaApprove", "nablaSwap"],
    prepareTxs: (ctx: PrepareCtx<NablaSwapMetadata>) =>
      prepareNablaSwapTxs(chain, inToken, outToken, ctx, options.cleanup !== false),
    simulate: (input, ctx) => simulateNablaSwap(chain, inToken, outToken, input, ctx)
  };
}
