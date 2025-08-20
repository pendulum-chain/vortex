import { fromPromise } from "xstate";
import { fetchKycStatus, KycStatus } from "../../../services/signingService";
import { BRLAKycContext } from "../../brlaKyc.machine";

const POLLING_INTERVAL_MS = 2000;

export const verifyStatusActor = fromPromise(async ({ input }: { input: BRLAKycContext }) => {
  const { taxId } = input;
  if (!taxId) {
    throw new Error("Tax ID is required");
  }

  return new Promise(resolve => {
    const interval = setInterval(async () => {
      try {
        const response = await fetchKycStatus(taxId);
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
