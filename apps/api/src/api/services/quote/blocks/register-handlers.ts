import logger from "../../../../config/logger";
import type { PhaseHandler } from "../../phases/base-phase-handler";
import phaseRegistry from "../../phases/phase-registry";
import { BlockInitialExecutor } from "./core/initial-executor";
import { getBlockExecutorFlows } from "./flows/catalog";

export function getBlockFlowHandlers(): PhaseHandler[] {
  const handlers = new Map<string, PhaseHandler>();
  const initial = new BlockInitialExecutor();
  handlers.set(initial.getPhaseName(), initial);

  for (const flow of getBlockExecutorFlows()) {
    for (const executor of flow.executors) {
      const phase = executor.getPhaseName();
      const existing = handlers.get(phase);
      if (existing && existing.constructor !== executor.constructor) {
        throw new Error(`Block flows define conflicting executors for phase ${phase}`);
      }
      handlers.set(phase, existing ?? executor);
    }
  }
  return [...handlers.values()];
}

export function registerBlockFlowHandlers(): void {
  logger.info("Registering block flow handlers");
  for (const handler of getBlockFlowHandlers()) {
    phaseRegistry.registerHandler(handler);
  }
  logger.info("Block flow handlers registered");
}
