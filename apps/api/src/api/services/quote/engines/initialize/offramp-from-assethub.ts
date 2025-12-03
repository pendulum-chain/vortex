import { RampDirection } from "@vortexfi/shared";
import { QuoteContext } from "../../core/types";
import { assignAssethubToPendulumXcm, assignPreNablaContext, BaseInitializeEngine, buildXcmMeta } from "./index";

export class OffRampFromAssethubInitializeEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "OffRampFromAssethubInitializeEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    await assignPreNablaContext(ctx);

    const xcmFees = buildXcmMeta();

    await assignAssethubToPendulumXcm(ctx, xcmFees);

    const meta = ctx.assethubToPendulumXcm;
    if (!meta) {
      throw new Error(
        "OffRampFromAssethubInitializeEngine: Assethub XCM context not assigned - ensure assignAssethubToPendulumXcm ran successfully"
      );
    }

    ctx.addNote?.(
      `Initialized: input=${meta.inputAmountDecimal.toString()} ${meta.fromToken}, raw=${meta.inputAmountRaw}, output=${meta.outputAmountDecimal.toString()} ${meta.fromToken}, raw=${meta.outputAmountRaw}`
    );
  }
}
