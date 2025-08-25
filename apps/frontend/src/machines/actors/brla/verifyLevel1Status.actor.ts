import { KycFailureReason } from "@packages/shared";
import { fromPromise } from "xstate";
import { fetchKycStatus, KycStatus } from "../../../services/signingService";
import { AveniaKycContext } from "../../kyc.states";

const POLLING_INTERVAL_MS = 2000;

export type VerifyStatusActorOutput = { type: "APPROVED" } | { type: "REJECTED"; reason: KycFailureReason };

export const verifyStatusActor = fromPromise<VerifyStatusActorOutput, AveniaKycContext>(async ({ input }) => {
  const { taxId } = input;
  if (!taxId) {
    throw new Error("Tax ID is required");
  }

  return new Promise(resolve => {
    const interval = setInterval(async () => {
      try {
        const response = await fetchKycStatus(taxId);
        console.log("KYC Status Response:", response);
        if (response.level === 1) {
          if (response.status === KycStatus.APPROVED) {
            clearInterval(interval);
            resolve({ type: "APPROVED" });
          } else if (response.status === KycStatus.REJECTED) {
            clearInterval(interval);
            resolve({ reason: response.failureReason, type: "REJECTED" });
          }
        }
      } catch (error) {
        clearInterval(interval);
        // The actor will transition to the onError state
        throw error;
      }
    }, POLLING_INTERVAL_MS);
  });
});
