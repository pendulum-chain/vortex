import { KycAttemptResult, KycFailureReason } from "@vortexfi/shared";
import { fromPromise } from "xstate";
import { fetchKycStatus } from "../../../services/signingService";
import { AveniaKycContext } from "../../kyc.states";

const POLLING_INTERVAL_MS = 2000;
const MAX_FAILURES = 10;

export type VerifyStatusActorOutput = { type: "APPROVED" } | { type: "REJECTED"; reason: KycFailureReason };

export const verifyStatusActor = fromPromise<VerifyStatusActorOutput, AveniaKycContext>(async ({ input }) => {
  const { taxId } = input;
  if (!taxId) {
    throw new Error("Tax ID is required");
  }

  return new Promise((resolve, reject) => {
    let failureCount = 0;
    const interval = setInterval(async () => {
      try {
        const response = await fetchKycStatus(taxId);
        console.log("KYC Status Response:", response);
        failureCount = 0;

        if (response.result === KycAttemptResult.APPROVED) {
          clearInterval(interval);
          resolve({ type: "APPROVED" });
        } else if (response.result === KycAttemptResult.REJECTED) {
          clearInterval(interval);
          const reason = response.failureReason || KycFailureReason.UNKNOWN;
          resolve({ reason, type: "REJECTED" });
        }
      } catch (_error) {
        failureCount++;
        if (failureCount >= MAX_FAILURES) {
          clearInterval(interval);
          reject(new Error(`Failed to fetch KYC status after ${MAX_FAILURES} attempts.`));
        }
      }
    }, POLLING_INTERVAL_MS);
  });
});
