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
      ({ subAccountId } = await BrlaService.getUser(taxId));
      return { subAccountId };
    } catch (error: unknown) {
      console.log("Debug: failed to fetch existing Avenia subaccount", error);
      const err = error as string;
      console.log("type fo err", typeof String(err));

      ({ subAccountId } = await createSubaccount({
        accountType: AveniaAccountType.INDIVIDUAL,
        name: kycFormData.fullName,
        taxId
      }));

      return { subAccountId };
    }
  }
);
