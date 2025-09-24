import { AveniaAccountType, BrlaGetKycStatusResponse, KycAttemptStatus } from "@packages/shared";
import { fromPromise } from "xstate";
import { isValidCnpj } from "../../../hooks/ramp/schema";
import { BrlaService } from "../../../services/api";
import { createSubaccount, fetchKycStatus } from "../../../services/signingService";
import { AveniaKycContext } from "../../kyc.states";

export const createSubaccountActor = fromPromise(
  async ({
    input
  }: {
    input: AveniaKycContext;
  }): Promise<{ subAccountId: string; maybeKycAttemptStatus?: BrlaGetKycStatusResponse }> => {
    const { taxId, kycFormData } = input;

    let subAccountId: string;
    let maybeKycAttemptStatus: BrlaGetKycStatusResponse | undefined;
    if (!kycFormData) {
      throw new Error("Invalid input state. This is a Bug.");
    }

    try {
      ({ subAccountId } = await BrlaService.getUser(taxId));

      try {
        maybeKycAttemptStatus = await fetchKycStatus(taxId);
      } catch (e) {
        console.log("Debug: could not fetch kyc status", e);
        // It's fine if this fails, we just won't have the status.
      }

      if (
        maybeKycAttemptStatus?.status === KycAttemptStatus.PENDING ||
        maybeKycAttemptStatus?.status === KycAttemptStatus.PROCESSING
      ) {
        return { maybeKycAttemptStatus, subAccountId };
      }

      return { subAccountId };
    } catch (error: unknown) {
      console.log("Debug: failed to fetch existing Avenia subaccount", error);

      if (isValidCnpj(taxId) && !kycFormData.companyName) {
        throw new Error("createSubaccountActor: Invalid input state. This is a Bug.");
      }

      const newSubaccountName = isValidCnpj(taxId) ? kycFormData.companyName! : kycFormData.fullName;

      ({ subAccountId } = await createSubaccount({
        accountType: AveniaAccountType.INDIVIDUAL,
        name: newSubaccountName,
        taxId
      }));

      return { subAccountId };
    }
  }
);
