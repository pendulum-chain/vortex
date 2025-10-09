import { RampDirection } from "@packages/shared";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export interface InitializeStageConfig {
  direction: RampDirection;
  skipNote: string;
}

export abstract class BaseInitializeEngine implements Stage {
  abstract readonly config: InitializeStageConfig;

  readonly key = StageKey.Initialize;

  async execute(ctx: QuoteContext): Promise<void> {
    const { direction, skipNote } = this.config;

    if (ctx.request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    await this.executeInternal(ctx);
  }

  protected abstract executeInternal(ctx: QuoteContext): Promise<void>;
}

export function assertContext<T>(value: T | undefined | null, message: string): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}
