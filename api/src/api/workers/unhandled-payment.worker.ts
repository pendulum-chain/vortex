import { CronJob } from 'cron';
import logger from '../../config/logger';
import RampState from '../../models/rampState.model';
import { BrlaApiService } from '../services/brla/brlaApiService';
import { Op } from 'sequelize';
import { generateReferenceLabel, isValidReferenceLabel } from '../services/brla/helpers';
import { SlackNotifier } from '../services/slack.service';
import { DepositLog } from '../services/brla/types';

const DEFAULT_CRON_TIME = '*/15 * * * *';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;


class UnhandledPaymentWorker {
  private job: CronJob;
  private readonly brlaApiService: BrlaApiService;
  private readonly slackNotifier: SlackNotifier;
  private alertsThisCycle: string[]; 
  // Store processed states in memory to save compute and db calls.
  // This worker assumes that checkUnhandledPayments is idempotent on the same state.
  // Should the state be unhandled, it shall not be alerted again.
  private processedStateIds: Set<string> = new Set();
  // Store subaccountIds with timestamps to limit alerts to one per day per subaccount
  private alertedSubaccounts: Map<string, number> = new Map();

  constructor(cronTime = DEFAULT_CRON_TIME) {
    this.brlaApiService = BrlaApiService.getInstance();
    this.slackNotifier = new SlackNotifier();
    this.alertsThisCycle = []; 

    this.job = new CronJob(
      cronTime,
      this.checkUnhandledPayments.bind(this),
      null,
      false,
      undefined,
      null,
      true,
    );
  }

  public start(): void {
    logger.info('Starting unhandled payment worker');
    this.job.start();
  }

  public stop(): void {
    logger.info('Stopping unhandled payment worker');
    this.job.stop();
  }

  private async checkUnhandledPayments(): Promise<void> {
    logger.info('Running unhandled payment worker cycle');
    try {
      const staleInitialStates = await this.fetchStaleInitialStates();
      const failedStates = await this.fetchFailedStates();

      const statesToCheck = [...staleInitialStates, ...failedStates];

      if (statesToCheck.length === 0) {
        logger.info('No stale or failed states found for payment check');
        return;
      }

      logger.info(`Found ${statesToCheck.length} states to check for unhandled payments`);

      await this.processStatesForUnhandledPayments(statesToCheck);

      logger.info('Unhandled payment worker cycle completed');
    } catch (error) {
      logger.error('Error during unhandled payment worker cycle:', error);
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
          currentPhase: 'initial',
          createdAt: {
            [Op.lt]: tenMinutesAgo,
            [Op.gt]: threeDaysAgo,
          },
          id: {
            [Op.notIn]: Array.from(this.processedStateIds),
          },
        },
      });

      return states;
    } catch (error) {
      logger.error('Error fetching stale initial states:', error);
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
          currentPhase: 'failed',
          createdAt: {
            [Op.gt]: threeDaysAgo,
          },
          id: {
            [Op.notIn]: Array.from(this.processedStateIds),
          },
        },
      });

      return states;
    } catch (error) {
      logger.error('Error fetching failed states:', error);
      return [];
    }
  }

  private findFirstDuplicateReferenceInfo(payments: DepositLog[]): { label: string; ids: string[] } | undefined {
    const referenceDetails = new Map<string, string[]>(); 
    for (const payment of payments) {
      if (!payment.referenceLabel || !payment.id) { 
        continue;
      }

      const existingIds = referenceDetails.get(payment.referenceLabel);
      if (existingIds) {
        existingIds.push(payment.id);
        return { label: payment.referenceLabel, ids: existingIds };
      } else {
        referenceDetails.set(payment.referenceLabel, [payment.id]);
      }
    }
    return undefined;
  }

  private hasRecentAlert(subaccountId: string): boolean {
    const lastAlertTime = this.alertedSubaccounts.get(subaccountId);
    if (!lastAlertTime) {
      return false;
    }
    
    const now = Date.now();
    return (now - lastAlertTime) < ONE_DAY_MS;
  }

  private async processStatesForUnhandledPayments(states: RampState[]): Promise<void> {
    for (const state of states) {
      try {
        // If already alerted in a previous cycle (DB flag is set), skip generating new alerts.
        // The processedStateIds set primarily prevents re-fetching and re-processing after server restarts.
        if (state.state.unhandledPaymentAlertSent) {
          this.processedStateIds.add(state.id); 
          continue;
        }

        const subaccount = await this.brlaApiService.getSubaccount(state.state.taxId);
        if (!subaccount) {
          logger.warn(`No subaccount ID (taxId) found for state ${state.id}. Skipping payment checks for this state.`);
          this.updateAlertedState(state); 
          continue;
        }
        const subaccountId = subaccount.id;

        if (this.hasRecentAlert(subaccount.id)) {
          continue;
        }

        const referenceLabel = generateReferenceLabel(state.quoteId);
        const paymentHistory = await this.brlaApiService.getPayInHistory(subaccountId);

        // Check 1: Unexpected payment found for the state's specific referenceLabel
        const matchingPayments = paymentHistory.filter(payment =>
          payment.referenceLabel === referenceLabel && payment.id
        );
        
        if (matchingPayments.length > 0) {
          const firstMatchingPayment = matchingPayments[0]; 
          logger.error(`ALERT: Found ${matchingPayments.length} unhandled payment(s) for state ${state.id} with reference label ${referenceLabel}. First Payment ID: ${firstMatchingPayment.id}`);
          const reason = 'Payment found for an initial or failed state where none was expected.';
          const slackMessage = `Unhandled payment for State ID: ${state.id}, Payment ID(s): ${matchingPayments.map(p => p.id).join(', ')}, Label: ${referenceLabel}, Reason: ${reason}`;

          this.alertsThisCycle.push(slackMessage);
          this.alertedSubaccounts.set(subaccountId, Date.now());
        }

        // Check 2: General duplicate reference labels in the payment history for the subaccount
        const duplicateInfo = this.findFirstDuplicateReferenceInfo(paymentHistory);
        if (duplicateInfo) {
          logger.error(`ALERT: Found duplicate reference label ('${duplicateInfo.label}') in payment history for subaccount of state ${state.id}. Associated Payment IDs: ${duplicateInfo.ids.join(', ')}`);
          const reason = `Duplicate reference label '${duplicateInfo.label}' detected in subaccount ${subaccountId}.`;
          const slackMessage = `Duplicate payment reference issue associated with State ID: ${state.id}. Duplicated Label: '${duplicateInfo.label}', Involved Payment IDs: ${duplicateInfo.ids.join(', ')}. Reason: ${reason}`;

          this.alertsThisCycle.push(slackMessage);
          this.alertedSubaccounts.set(subaccountId, Date.now());
        }

        // Check 3: Payments with NO reference label, or invalid one.
        const paymentsWithInvalidLabels = paymentHistory.filter(payment => 
          payment.id && payment.referenceLabel !== undefined && !isValidReferenceLabel(payment.referenceLabel)
        );

        if (paymentsWithInvalidLabels.length > 0) {
          const firstInvalidPayment = paymentsWithInvalidLabels[0];
          const invalidLabel = firstInvalidPayment.referenceLabel || 'undefined';
          logger.error(`ALERT: Found ${paymentsWithInvalidLabels.length} payment(s) with invalid reference label for state ${state.id}. First Payment ID: ${firstInvalidPayment.id}, Invalid Label: '${invalidLabel}'`);
          const reason = `Invalid reference label format detected. Expected 8 characters, found: '${invalidLabel}'`;
          const slackMessage = `Invalid payment reference label for State ID: ${state.id}, Payment ID(s): ${firstInvalidPayment.id}, Invalid Label: '${invalidLabel}', Reason: ${reason}`;
          
          this.alertsThisCycle.push(slackMessage);
          this.alertedSubaccounts.set(subaccountId, Date.now());
        }
        
      } catch (error) {
        logger.error(`Error processing state ${state.id} for unhandled payments:`, error);
      }
      this.updateAlertedState(state);
    }
    
    if (this.alertsThisCycle.length > 0) {
      await this.notifySlack();
    }
    logger.info(`Attempted to process ${states.length} states for unhandled payments this cycle.`);
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
      logger.info('No alerts to send to Slack in this cycle.');
      return;
    }

    const alertText = this.alertsThisCycle.join('\n');
    try {
      logger.info(`Attempting to send ${this.alertsThisCycle.length} alert(s) to Slack.`);
      await this.slackNotifier.sendMessage({ text: alertText });
      logger.info('Slack notification sent successfully.');
      this.alertsThisCycle = []; 
    } catch (error) {
      logger.error('Error sending Slack notification:', error);
      // alertsThisCycle is not cleared, so messages will be included in the next attempt.
    }
  }
}

export default UnhandledPaymentWorker;
