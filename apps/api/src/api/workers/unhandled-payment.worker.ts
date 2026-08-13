import { BrlaApiService, generateReferenceLabel, normalizeTaxId } from "@vortexfi/shared";
import { CronJob } from "cron";
import { Op } from "sequelize";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import RampState from "../../models/rampState.model";
import { findAveniaCustomerByTaxId } from "../services/avenia/avenia-customer.service";
import { SlackNotifier } from "../services/slack.service";

const DEFAULT_CRON_TIME = "*/15 * * * *";
const TEN_MINUTES_MS = 10 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

class UnhandledPaymentWorker {
  private job: CronJob;
  private readonly brlaApiService: Pick<BrlaApiService, "getAveniaPayinTickets">;
  private readonly recoverPaidAveniaRamp: (rampId: string) => Promise<unknown>;
  private readonly slackNotifier: Pick<SlackNotifier, "sendMessage">;
  private alertsThisCycle: string[];
  // Store processed states in memory to save compute and db calls.
  // This worker assumes that checkUnhandledPayments is idempotent on the same state.
  // Should the state be unhandled, it shall not be alerted again.
  private processedStateIds: Set<string> = new Set();
  // Store subaccountIds with timestamps to limit alerts to one per day per subaccount
  private alertedSubaccounts: Map<string, number> = new Map();

  constructor(
    cronTime = DEFAULT_CRON_TIME,
    dependencies: {
      brlaApiService?: Pick<BrlaApiService, "getAveniaPayinTickets">;
      recoverPaidAveniaRamp?: (rampId: string) => Promise<unknown>;
      runOnInit?: boolean;
      slackNotifier?: Pick<SlackNotifier, "sendMessage">;
    } = {}
  ) {
    this.brlaApiService = dependencies.brlaApiService ?? BrlaApiService.getInstance();
    this.recoverPaidAveniaRamp =
      dependencies.recoverPaidAveniaRamp ??
      (async rampId => {
        const { default: rampService } = await import("../services/ramp/ramp.service");
        return rampService.recoverPaidAveniaRamp(rampId);
      });
    this.slackNotifier = dependencies.slackNotifier ?? new SlackNotifier();
    this.alertsThisCycle = [];

    this.job = new CronJob(
      cronTime,
      this.checkUnhandledPayments.bind(this),
      null,
      false,
      undefined,
      null,
      dependencies.runOnInit ?? true
    );
  }

  public start(): void {
    logger.info("Starting unhandled payment worker");
    this.job.start();
  }

  public stop(): void {
    logger.info("Stopping unhandled payment worker");
    this.job.stop();
  }

  private async checkUnhandledPayments(): Promise<void> {
    logger.info("Running unhandled payment worker cycle");
    try {
      const staleInitialStates = await this.fetchStaleInitialStates();
      const failedStates = await this.fetchFailedStates();

      const statesToCheck = [...staleInitialStates, ...failedStates];

      if (statesToCheck.length === 0) {
        logger.info("No stale or failed states found for payment check");
        return;
      }

      logger.info(`Found ${statesToCheck.length} states to check for unhandled payments`);

      await this.processStatesForUnhandledPayments(statesToCheck);

      logger.info("Unhandled payment worker cycle completed");
    } catch (error) {
      logger.error("Error during unhandled payment worker cycle:", error);
    }
  }

  /**
   * Fetch initial ramp states that are stale (created > 10 minutes ago but < 3 days)
   */
  private async fetchStaleInitialStates(): Promise<RampState[]> {
    const tenMinutesAgo = new Date(Date.now() - TEN_MINUTES_MS);
    const threeDaysAgo = new Date(Date.now() - THREE_DAYS_MS);

    try {
      const states = await RampState.findAll({
        where: {
          createdAt: {
            [Op.lt]: tenMinutesAgo,
            [Op.gt]: threeDaysAgo
          },
          currentPhase: "initial",
          flowVariant: config.flowVariant,
          id: {
            [Op.notIn]: Array.from(this.processedStateIds)
          }
        }
      });

      return states;
    } catch (error) {
      logger.error("Error fetching stale initial states:", error);
      return [];
    }
  }

  /**
   * Fetch failed ramp states (< 3 days old)
   */
  private async fetchFailedStates(): Promise<RampState[]> {
    const threeDaysAgo = new Date(Date.now() - THREE_DAYS_MS);

    try {
      const states = await RampState.findAll({
        where: {
          createdAt: {
            [Op.gt]: threeDaysAgo
          },
          currentPhase: "failed",
          flowVariant: config.flowVariant,
          id: {
            [Op.notIn]: Array.from(this.processedStateIds)
          }
        }
      });

      return states;
    } catch (error) {
      logger.error("Error fetching failed states:", error);
      return [];
    }
  }

  private hasRecentAlert(subaccountId: string): boolean {
    const lastAlertTime = this.alertedSubaccounts.get(subaccountId);
    if (!lastAlertTime) {
      return false;
    }

    const now = Date.now();
    return now - lastAlertTime < ONE_DAY_MS;
  }

  private async processStatesForUnhandledPayments(states: RampState[]): Promise<void> {
    if (states.length === 0) {
      return;
    }

    // Group states by taxId, filtering for states that have a ticket ID (only pix onramps)
    // Also filter out states that have already been alerted for unhandled payments.
    const statesByTaxId: Record<string, RampState[]> = states.reduce(
      (acc, state) => {
        const { taxId, aveniaTicketId, unhandledPaymentAlertSent } = state.state;
        if (taxId && aveniaTicketId && !unhandledPaymentAlertSent) {
          if (!acc[taxId]) {
            acc[taxId] = [];
          }
          acc[taxId].push(state);
        }
        return acc;
      },
      {} as Record<string, RampState[]>
    );

    for (const taxId in statesByTaxId) {
      try {
        const statesForTaxId = statesByTaxId[taxId];
        let legacySubAccountId: string | null = null;
        if (statesForTaxId.some(state => !state.state.subAccountId)) {
          const aveniaCustomer = await findAveniaCustomerByTaxId(taxId);
          legacySubAccountId = aveniaCustomer?.providerSubaccountId ?? null;
        }

        const statesBySubAccountId = new Map<string, RampState[]>();
        for (const state of statesForTaxId) {
          // New ramps snapshot this identity at registration. The fallback keeps pre-deploy
          // ramps recoverable without making current mutable identity authoritative for them.
          const subAccountId = state.state.subAccountId ?? legacySubAccountId;
          if (!subAccountId) {
            logger.warn(`No Avenia provider account found for state ${state.id}. Skipping state.`);
            this.processedStateIds.add(state.id);
            continue;
          }
          const grouped = statesBySubAccountId.get(subAccountId) ?? [];
          grouped.push(state);
          statesBySubAccountId.set(subAccountId, grouped);
        }

        for (const [subAccountId, groupedStates] of statesBySubAccountId) {
          const tickets = await this.brlaApiService.getAveniaPayinTickets(subAccountId);
          const aveniaTicketSet = new Set(tickets.filter(ticket => ticket.status === "PAID").map(ticket => ticket.id));

          for (const state of groupedStates) {
            const ticketIdFromState = state.state.aveniaTicketId;

            if (!ticketIdFromState) {
              // Should not be hit due to the filter in the reducer.
              logger.warn(`UnhandledPaymentWorker: State ${state.id} is missing an aveniaTicketId. Skipping.`);
              this.processedStateIds.add(state.id);
              continue;
            }

            if (aveniaTicketSet.has(ticketIdFromState)) {
              if (state.currentPhase === "initial") {
                try {
                  await this.recoverPaidAveniaRamp(state.id);
                  this.processedStateIds.add(state.id);
                  logger.info(`Recovered paid initial Avenia ramp ${state.id}.`);
                  continue;
                } catch (error) {
                  // Keep the state eligible for the next cycle. A transient processor/database
                  // failure must not turn an automatic recovery attempt into a one-shot alert.
                  logger.error(`Failed to recover paid initial Avenia ramp ${state.id}:`, error);
                }
              }

              // Recovery failed, or a paid ramp is already in failed state: alert operations.
              if (!this.hasRecentAlert(subAccountId)) {
                const referenceLabel = generateReferenceLabel({ id: ticketIdFromState });
                const alertMessage = `Unhandled payment detected for stateId: ${state.id}, ticketId: ${ticketIdFromState}. Please investigate. Ref: ${referenceLabel}`;
                this.alertsThisCycle.push(alertMessage);
                this.alertedSubaccounts.set(subAccountId, Date.now());
              }
              if (state.currentPhase !== "initial") {
                await this.updateAlertedState(state);
              }
            } else {
              this.processedStateIds.add(state.id);
            }
          }
        }
      } catch (error) {
        logger.error(`Error processing states for taxId ${taxId}:`, error);
      }
    }

    await this.notifySlack();
  }

  private async updateAlertedState(state: RampState): Promise<void> {
    if (!state.state.unhandledPaymentAlertSent) {
      try {
        const newState = { ...state.state, unhandledPaymentAlertSent: true };
        await state.update({ state: newState });
        this.processedStateIds.add(state.id);
        logger.info(`State ${state.id} successfully updated to mark unhandledPaymentAlertSent.`);
      } catch (error) {
        logger.error(`Error updating state ${state.id} to mark alert as sent:`, error);
      }
    }
  }

  private async notifySlack(): Promise<void> {
    if (this.alertsThisCycle.length === 0) {
      logger.info("No alerts to send to Slack in this cycle.");
      return;
    }

    const alertText = this.alertsThisCycle.join("\n");
    try {
      logger.info(`Attempting to send ${this.alertsThisCycle.length} alert(s) to Slack.`);
      await this.slackNotifier.sendMessage({ text: alertText });
      logger.info("Slack notification sent successfully.");
      this.alertsThisCycle = [];
    } catch (error) {
      logger.error("Error sending Slack notification:", error);
      // alertsThisCycle is not cleared, so messages will be included in the next attempt.
    }
  }
}

export default UnhandledPaymentWorker;
