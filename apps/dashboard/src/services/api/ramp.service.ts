import type { TransactionStatus as DomainTransactionStatus } from "@/domain/types";
import {
  type GetRampStatusResponse,
  type QuoteResponse,
  type RampPhase,
  type RampProcess,
  type RegisterRampRequest,
  TransactionStatus
} from "./types";

interface RegisterAdditionalData {
  walletAddress?: string;
  destinationAddress?: string;
  pixDestination?: string;
  taxId?: string;
  email?: string;
  [key: string]: unknown;
}

interface MockRampEntry {
  quote: QuoteResponse;
  process: GetRampStatusResponse;
  startedAt?: number;
}

const ramps = new Map<string, MockRampEntry>();

// Phases the mock walks through once the ramp is started, with the elapsed ms at which each begins.
const PHASE_TIMELINE: { at: number; phase: RampPhase; status: TransactionStatus }[] = [
  { at: 0, phase: "fundEphemeral", status: TransactionStatus.PENDING },
  { at: 2500, phase: "nablaSwap", status: TransactionStatus.PENDING },
  { at: 5000, phase: "alfredpayOfframpTransfer", status: TransactionStatus.PENDING },
  { at: 7000, phase: "complete", status: TransactionStatus.COMPLETE }
];

function phaseForElapsed(elapsed: number): { phase: RampPhase; status: TransactionStatus } {
  let phase: RampPhase = "fundEphemeral";
  let status: TransactionStatus = TransactionStatus.PENDING;
  for (const step of PHASE_TIMELINE) {
    if (elapsed >= step.at) {
      phase = step.phase;
      status = step.status;
    }
  }
  return { phase, status };
}

/** Wire phase → dashboard transaction status (drives the Transactions table). */
export function mapPhaseToStatus(phase: RampPhase): DomainTransactionStatus {
  switch (phase) {
    case "initial":
      return "awaiting_payin";
    case "complete":
      return "completed";
    case "failed":
    case "timedOut":
      return "failed";
    default:
      return "processing";
  }
}

/**
 * Mirrors VortexSdk.registerRamp(quote, additionalData). Real swap: replace with
 * apiClient.post("/ramp/register", { quoteId, signingAccounts, additionalData }).
 */
export async function registerRamp(
  quote: QuoteResponse,
  additionalData: RegisterAdditionalData
): Promise<{ rampProcess: RampProcess; unsignedTransactions: [] }> {
  const now = Date.now();
  const id = `rmp_${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const process: GetRampStatusResponse = {
    anchorFeeFiat: quote.anchorFeeFiat,
    createdAt: new Date(now).toISOString(),
    currentPhase: "initial",
    discountCurrency: quote.discountCurrency,
    discountFiat: quote.discountFiat,
    feeCurrency: quote.feeCurrency,
    from: quote.from,
    id,
    inputAmount: quote.inputAmount,
    inputCurrency: quote.inputCurrency,
    network: quote.network,
    networkFeeFiat: quote.networkFeeFiat,
    outputAmount: quote.outputAmount,
    outputCurrency: quote.outputCurrency,
    partnerFeeFiat: quote.partnerFeeFiat,
    paymentMethod: quote.paymentMethod,
    processingFeeFiat: quote.processingFeeFiat,
    quoteId: quote.id,
    status: TransactionStatus.PENDING,
    to: quote.to,
    totalFeeFiat: quote.totalFeeFiat,
    type: quote.rampType,
    updatedAt: new Date(now).toISOString(),
    vortexFeeFiat: quote.vortexFeeFiat,
    walletAddress: additionalData.walletAddress
  };
  ramps.set(id, { process, quote });
  return { rampProcess: process, unsignedTransactions: [] };
}

/** Buildable wire request the mock stands in for. */
export function buildRegisterRampRequest(quoteId: string, additionalData: RegisterAdditionalData): RegisterRampRequest {
  return { additionalData, quoteId, signingAccounts: [] };
}

export async function startRamp(rampId: string): Promise<RampProcess> {
  const entry = ramps.get(rampId);
  if (!entry) {
    throw new Error("Ramp not found");
  }
  entry.startedAt = Date.now();
  entry.process = { ...entry.process, currentPhase: "fundEphemeral", updatedAt: new Date().toISOString() };
  return entry.process;
}

export async function getRampStatus(rampId: string): Promise<GetRampStatusResponse> {
  const entry = ramps.get(rampId);
  if (!entry) {
    throw new Error("Ramp not found");
  }
  if (entry.startedAt === undefined) {
    return entry.process;
  }
  const { phase, status } = phaseForElapsed(Date.now() - entry.startedAt);
  entry.process = { ...entry.process, currentPhase: phase, status, updatedAt: new Date().toISOString() };
  return entry.process;
}

/**
 * Mirrors RampService.pollRampStatus — polls getRampStatus until currentPhase is
 * complete/failed/timedOut (or status COMPLETE/FAILED), invoking onUpdate each tick.
 * Returns a stop() function.
 */
export function pollRampStatus(
  rampId: string,
  onUpdate: (status: GetRampStatusResponse) => void,
  intervalMs = 1500
): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) {
      return;
    }
    const status = await getRampStatus(rampId);
    onUpdate(status);
    const terminal =
      status.currentPhase === "complete" ||
      status.currentPhase === "failed" ||
      status.currentPhase === "timedOut" ||
      status.status === TransactionStatus.COMPLETE ||
      status.status === TransactionStatus.FAILED;
    if (!terminal && !stopped) {
      setTimeout(tick, intervalMs);
    }
  };
  setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
  };
}
