import { RampErrorLog } from "@vortexfi/shared";
import { CronJob } from "cron";
import { Op } from "sequelize";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import { RAMP_START_EXPIRATION_TIME_SECONDS } from "../../constants/constants";
import RampState from "../../models/rampState.model";
import { getFundedInitialSellRampWhere } from "../services/phases/blocks/core/compatibility-scope";
import { isMoonbeamRuntimeDisabledForState } from "../services/phases/moonbeam-runtime";
import phaseProcessor from "../services/phases/phase-processor";
import rampService from "../services/ramp/ramp.service";

const TEN_MINUTES_IN_MS = 10 * 60 * 1000;
// Funded SELL ramps are started only once the public start window has certainly closed.
const FUNDED_SELL_MIN_AGE_MS = (RAMP_START_EXPIRATION_TIME_SECONDS + 60) * 1000;
const DISABLED_HYDRATION_PHASES = ["pendulumToHydrationXcm", "hydrationSwap", "hydrationToAssethubXcm"];

/**
 * Worker to recover failed ramp states
 */
class RampRecoveryWorker {
  private job: CronJob;

  constructor(cronTime = "*/5 * * * *", runOnInit = true) {
    // Run immediately and then according to schedule
    this.job = new CronJob(
      cronTime,
      this.recover.bind(this),
      null, // onComplete
      false, // start
      undefined, // timeZone
      null, // context
      runOnInit
    );
  }

  /**
   * Start the worker
   */
  public start(): void {
    logger.info("Starting ramp recovery worker");
    this.job.start();
  }

  /**
   * Recover failed ramp states
   */
  // eslint-disable-next-line class-methods-use-this
  private async recover(): Promise<void> {
    try {
      logger.info("Running ramp recovery worker");

      // Find ramp states that have not been updated in the last 10 minutes
      // and are not in the 'complete', 'failed' or 'initial' phase
      const staleStates = await RampState.findAll({
        where: {
          currentPhase: {
            [Op.notIn]: ["complete", "failed", "initial", ...DISABLED_HYDRATION_PHASES]
          },
          flowVariant: config.flowVariant,
          presignedTxs: { [Op.not]: null },
          updatedAt: {
            [Op.lt]: new Date(Date.now() - TEN_MINUTES_IN_MS) // 10 minutes ago
          }
        }
      });

      // SELL ramps whose user reported the source transaction hash but whose client never started
      // them before the public start window closed. Their funds are already on the ephemeral.
      const fundedSellStates = await RampState.findAll({
        where: {
          ...getFundedInitialSellRampWhere(new Date(), FUNDED_SELL_MIN_AGE_MS),
          flowVariant: config.flowVariant
        }
      });

      const statesToRecover = [...staleStates, ...fundedSellStates].filter(state => !isMoonbeamRuntimeDisabledForState(state));
      const retiredStateCount = staleStates.length + fundedSellStates.length - statesToRecover.length;
      if (retiredStateCount > 0) {
        logger.warn(`Skipped ${retiredStateCount} Moonbeam-dependent ramp states during automatic recovery.`);
      }

      if (statesToRecover.length === 0) {
        logger.info("No eligible stale ramp states found.");
        return;
      }

      logger.info(`Found ${statesToRecover.length} stale ramp states to process.`);

      // Process each state concurrently. A funded initial SELL ramp is started (past the public
      // deadline); every other state resumes its current phase.
      const recoveryPromises = statesToRecover.map(async state => {
        try {
          logger.info(`Attempting recovery in phase ${state.currentPhase} for ramp ${state.id}`);
          // Process the state (processRamp already wraps execution with runWithRampContext)
          if (state.currentPhase === "initial") {
            await rampService.recoverFundedSellRamp(state.id);
          } else {
            await phaseProcessor.processRamp(state.id);
          }
          logger.info(`Successfully processed ramp state ${state.id}`);
          return { stateId: state.id, status: "fulfilled" };
        } catch (e: unknown) {
          const error = e as Error;

          logger.error(`Error recovering ramp state ${state.id}:`, error);

          // Prepare error log entry
          const errorLogEntry: RampErrorLog = {
            details: error.stack || "No stack trace available",
            error: error.message || "Unknown error during recovery",
            phase: state.currentPhase,
            timestamp: new Date().toISOString()
          };

          // Attempt to update the state with the error log
          try {
            await rampService.appendErrorLog(state.id, errorLogEntry);
            logger.info(`Updated ramp state ${state.id} with error log.`);
          } catch (updateE: unknown) {
            const updateError = updateE as Error;
            logger.error(`Failed to update ramp state ${state.id} with error log:`, updateError);
            // Log the original error as well if the update fails
            logger.error(`Original recovery error for ${state.id}:`, error);
          }
          // Return a rejected status for Promise.allSettled
          return { reason: error, stateId: state.id, status: "rejected" };
        }
      });

      // Wait for all recovery attempts to settle
      const results = await Promise.allSettled(recoveryPromises);

      // Log summary of results
      // Each attempt catches its own error and resolves with its outcome in `value.status`.
      const successfulRecoveries = results.filter(r => r.status === "fulfilled" && r.value.status === "fulfilled").length;
      const failedRecoveries = results.length - successfulRecoveries;
      logger.info(`Ramp recovery attempt completed. Successful: ${successfulRecoveries}, Failed: ${failedRecoveries}`);
    } catch (error) {
      // Catch errors from the initial findAll or other unexpected issues
      logger.error("Critical error in ramp recovery worker:", error);
    }
  }
}

export default RampRecoveryWorker;
