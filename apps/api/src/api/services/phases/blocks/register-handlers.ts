import { Op } from "sequelize";
import logger from "../../../../config/logger";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import type { PhaseHandler } from "../../phases/base-phase-handler";
import phaseRegistry from "../../phases/phase-registry";
import { BlockInitialExecutor } from "./core/initial-executor";
import { getBlockExecutorFlows, getBlockFlowByIdentity, resolvePersistedBlockFlow } from "./flows/catalog";

export function getBlockFlowHandlers(): PhaseHandler[] {
  const handlers = new Map<string, PhaseHandler>();
  const initial = new BlockInitialExecutor();
  handlers.set(initial.getPhaseName(), initial);

  for (const flow of getBlockExecutorFlows()) {
    if (flow.phases.length !== flow.executors.length) {
      throw new Error(
        `Block flow ${flow.identity.id}@${flow.identity.version} has ${flow.phases.length} phases but ${flow.executors.length} executors`
      );
    }
    for (const [index, phaseName] of flow.phases.entries()) {
      if (flow.executors[index]?.getPhaseName() !== phaseName) {
        throw new Error(
          `Block flow ${flow.identity.id}@${flow.identity.version} executor ${index} does not match phase ${phaseName}`
        );
      }
    }
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
  for (const flow of getBlockExecutorFlows()) {
    for (const phase of flow.phases) {
      if (!phaseRegistry.getHandler(phase)) {
        throw new Error(`No registered handler for ${flow.identity.id}@${flow.identity.version} phase ${phase}`);
      }
    }
  }
  logger.info("Block flow handlers registered");
}

export async function assertPersistedBlockFlowVersionsSupported(): Promise<void> {
  const [pendingQuotes, activeRamps] = await Promise.all([
    QuoteTicket.findAll({
      attributes: ["id", "metadata"],
      where: { expiresAt: { [Op.gt]: new Date() }, status: "pending" }
    }),
    RampState.findAll({
      attributes: ["id", "quoteId", "state"],
      where: { currentPhase: { [Op.notIn]: ["complete", "failed", "timedOut"] } }
    })
  ]);

  for (const quote of pendingQuotes) {
    resolvePersistedBlockFlow(quote.metadata);
  }

  for (const ramp of activeRamps) {
    const quote = await QuoteTicket.findByPk(ramp.quoteId, { attributes: ["id", "metadata"] });
    if (!quote) {
      throw new Error(`Active ramp ${ramp.id} references missing quote ${ramp.quoteId}`);
    }
    const quoteFlow = resolvePersistedBlockFlow(quote.metadata);
    const flow = ramp.state.flow ? getBlockFlowByIdentity(ramp.state.flow) : quoteFlow;
    if (ramp.state.flow) {
      if (
        flow.identity.id !== quoteFlow.identity.id ||
        flow.identity.version !== quoteFlow.identity.version ||
        flow.identity.topologyHash !== quoteFlow.identity.topologyHash
      ) {
        throw new Error(`Ramp ${ramp.id} flow identity does not match quote ${ramp.quoteId}`);
      }
      flow.assertState(ramp.state);
      continue;
    }
    const expectedPhaseFlow = ["initial", ...flow.phases, "complete"];
    if (JSON.stringify(ramp.state.phaseFlow) !== JSON.stringify(expectedPhaseFlow)) {
      throw new Error(`Legacy ramp ${ramp.id} does not match supported flow ${flow.identity.id}@${flow.identity.version}`);
    }
  }

  logger.info(
    `Validated persisted block-flow support for ${pendingQuotes.length} pending quotes and ${activeRamps.length} active ramps`
  );
}
