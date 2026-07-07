import type {
  AccountMeta,
  GetRampStatusResponse,
  PresignedTx,
  RampProcess,
  RegisterRampRequest,
  UpdateRampRequest
} from "@vortexfi/shared";
import type { TransactionStatus as DomainTransactionStatus } from "@/domain/types";
import { apiClient } from "./api-client";

/** Wire phase → dashboard transaction status (drives the Transactions table). */
export function mapPhaseToStatus(phase: string): DomainTransactionStatus {
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

/** Ported from the widget's RampService — the real /v1/ramp/* endpoints. */
export const RampService = {
  getRampStatus(rampId: string): Promise<GetRampStatusResponse> {
    return apiClient.get<GetRampStatusResponse>(`/ramp/${rampId}`);
  },

  registerRamp(
    quoteId: string,
    signingAccounts: AccountMeta[],
    additionalData?: RegisterRampRequest["additionalData"]
  ): Promise<RampProcess> {
    return apiClient.post<RampProcess>("/ramp/register", { additionalData, quoteId, signingAccounts });
  },

  startRamp(rampId: string): Promise<RampProcess> {
    return apiClient.post<RampProcess>("/ramp/start", { rampId });
  },

  updateRamp(
    rampId: string,
    presignedTxs: PresignedTx[],
    additionalData?: UpdateRampRequest["additionalData"]
  ): Promise<RampProcess> {
    return apiClient.post<RampProcess>("/ramp/update", { additionalData, presignedTxs, rampId });
  }
};

export function isTerminalPhase(status: GetRampStatusResponse): boolean {
  return (
    status.currentPhase === "complete" ||
    status.currentPhase === "failed" ||
    status.currentPhase === "timedOut" ||
    status.status === "COMPLETE" ||
    status.status === "FAILED"
  );
}
