import { AveniaAccountType } from "@packages/shared";
import { fromPromise } from "xstate";
import { BrlaService } from "../../../services/api";
import { createSubaccount, KycSubmissionNetworkError } from "../../../services/signingService";
import { AveniaKycContext } from "../../kyc.states";

export const createSubaccountActor = fromPromise(
  async ({ input }: { input: AveniaKycContext }): Promise<{ subAccountId: string }> => {
    const { taxId, kycFormData } = input;

    let subAccountId: string;

    if (!kycFormData) {
      throw new Error("Invalid input state. This is a Bug.");
    }

    try {
      const { subAccountId: existingSubAccountId } = await BrlaService.getUser(taxId);
      subAccountId = existingSubAccountId;
    } catch (error: unknown) {
      const err = error as { response?: { status: number; statusText: string } };
      if (err.response?.status === 404) {
        console.log("Debug: creating new Avenia subaccount");

        const { subAccountId: newSubAccountId } = await createSubaccount({
          accountType: AveniaAccountType.INDIVIDUAL,
          name: kycFormData.fullName,
          taxId
        });
        subAccountId = newSubAccountId;
      } else if (err.response && err.response.status >= 500) {
        throw new KycSubmissionNetworkError(`Failed to submit KYC due to a server error: ${err.response.statusText}`);
      } else {
        throw err;
      }
    }

    return { subAccountId };
  }
);
