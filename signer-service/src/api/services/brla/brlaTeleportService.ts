import { BrlaApiService } from './brlaApiService';
import { FastQuoteQueryParams, BrlaSupportedChain, OnchainLog, SmartContractOperationType } from './types';
import { verifyReferenceLabel } from './helpers';

// This service is used to request and keep tracks of teleports (transfers) from BRLA's
// controlled accounts.
// The process involves: requesting a "fast quote" for a swap, between BRLA -> BRLA on Moonbeam,
// executing a swap operation corresponding to the quote, and finally, confirming the swap.

// The first step is a "claim" step, where the user claims making the payment. We wait until the minting is
// confirmed to quote and start the transfer.

export type EvmAddress = `0x${string}`;

type TeleportStatus = 'claimed' | 'arrived' | 'quoted' | 'started' | 'completed' | 'failed';

type Teleport = {
  amount: number;
  subaccountId: string;
  dateRequested: string;
  status: TeleportStatus;
  receiverAddress: EvmAddress;
  memo?: string;
  id?: string;
};

export class BrlaTeleportService {
  private static teleportService: BrlaTeleportService;
  private brlaApiService: BrlaApiService;
  private checkInterval: NodeJS.Timeout | null = null;
  private intervalMs: number = 10000;

  private teleports: Map<string, Teleport> = new Map();
  private completedTeleports: Map<string, Teleport> = new Map();

  constructor(intervalMs?: number) {
    this.brlaApiService = BrlaApiService.getInstance();

    if (intervalMs) {
      this.intervalMs = intervalMs;
    }
  }

  public static getInstance(): BrlaTeleportService {
    if (!BrlaTeleportService.teleportService) {
      BrlaTeleportService.teleportService = new BrlaTeleportService();
    }
    return BrlaTeleportService.teleportService;
  }

  public async requestTeleport(subaccountId: string, amount: number, receiverAddress: EvmAddress): Promise<void> {
    const teleport: Teleport = {
      amount,
      subaccountId,
      dateRequested: new Date().toISOString(),
      status: 'claimed',
      receiverAddress,
    };
    console.log('Requesting teleport:', teleport);
    this.teleports.set(subaccountId, teleport);
    this.maybeStartPeriodicChecks();
  }

  private async startTeleport(subaccountId: string): Promise<void> {
    let teleport = this.teleports.get(subaccountId);

    // Ignore operation
    if (teleport === undefined) {
      throw new Error('Teleport not found. This cannot not happen.');
    }

    if (teleport.status !== 'arrived') {
      throw new Error('Teleport not in arrived state.');
    }

    console.log('Starting teleport:', teleport);
    const fastQuoteParams: FastQuoteQueryParams = {
      subaccountId: teleport.subaccountId,
      operation: 'swap',
      amount: Number(teleport.amount),
      inputCoin: 'BRLA',
      outputCoin: 'BRLA',
      chain: BrlaSupportedChain.BRLA,
      fixOutput: true,
    };

    try {
      const { token: quoteToken } = await this.brlaApiService.createFastQuote(fastQuoteParams);
      this.teleports.set(subaccountId, { ...teleport, status: 'quoted' });

      // Execute the actual swap operation
      const { id } = await this.brlaApiService.swapRequest({
        token: quoteToken,
        receiverAddress: teleport.receiverAddress,
      });
      this.teleports.set(subaccountId, { ...teleport, status: 'started', id });

      this.maybeStartPeriodicChecks();
    } catch (e) {
      console.log('Error starting teleport:', e);
      this.teleports.set(subaccountId, { ...teleport, status: 'failed' });
    }
  }

  private maybeStartPeriodicChecks(): void {
    const pendingTeleports = [...this.teleports.entries()].filter(
      (entry) => entry[1].status === 'claimed' || entry[1].status === 'started',
    ).length;

    if (this.checkInterval === null && pendingTeleports > 0) {
      this.checkInterval = setInterval(() => {
        this.checkPendingTeleports().catch((err) => {
          console.error('Error in periodic teleport check:', err);
        });
      }, this.intervalMs);
    }
  }

  private async checkPendingTeleports(): Promise<void> {
    if (this.teleports.size === 0 && this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.teleports.forEach(async (teleport, subaccountId) => {
      if (teleport.status === 'started') {
        const onChainOuts = await this.brlaApiService.getOnChainHistoryOut(subaccountId);
        const relevantOut = onChainOuts.find((out: OnchainLog) => out.id === teleport.id);

        if (!relevantOut) {
          return;
        }

        // We are interested in the last contract op for this operation being
        // a mint one. smartContractOps are ordered descending by timestamp.
        const lastContractOp = relevantOut.smartContractOps[0];

        if (lastContractOp.operationName === SmartContractOperationType.MINT && lastContractOp.executed === true) {
          this.completedTeleports.set(subaccountId, { ...teleport, status: 'completed' });
          console.log('Teleport completed:', teleport);
          this.teleports.delete(subaccountId);
        }
      }
    });

    this.teleports.forEach(async (teleport, subaccountId) => {
      // For claimed teleports, we need to wait for funds to arrive, only then it makes sense to
      // start the actual transfer process.
      if (teleport.status === 'claimed') {
        const payIns = await this.brlaApiService.getPayInHistory(subaccountId);

        if (payIns.length === 0) {
          return;
        }

        // Must be the last one, if any.
        const lastPayIn = payIns[0];
        // Check the referceLabel to match the address requested, and amount.
        // Last mintOp should match the amount.
        if (
          verifyReferenceLabel(lastPayIn.referenceLabel, teleport.receiverAddress) &&
          lastPayIn.mintOps[0].amount === teleport.amount
        ) {
          this.teleports.set(subaccountId, { ...teleport, status: 'arrived' });
          this.startTeleport(subaccountId);
        }

        // delete teleports that have been waiting for more than 15 minutes
        if (teleport.status === 'claimed' && Date.now() - new Date(teleport.dateRequested).getTime() > 15 * 60 * 1000) {
          this.teleports.delete(subaccountId);
        }
      }
    });
  }
}
