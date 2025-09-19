import { AveniaAccountType } from "@packages/shared/src/services";
import { fromPromise } from "xstate";
import { BrlaService } from "../../../services/api";
import { createSubaccount, KycSubmissionNetworkError, submitNewKyc } from "../../../services/signingService";
import { AveniaKycContext } from "../../kyc.states";

export const submitActor = fromPromise(async ({ input }: { input: AveniaKycContext }): Promise<void> => {
  const { taxId, kycFormData, documentUploadIds } = input;

  if (!documentUploadIds || !documentUploadIds.uploadedSelfieId || !documentUploadIds.uploadedDocumentId || !kycFormData) {
    throw new Error("Invalid input state. This is a Bug.");
  }

  const payload = {
    city: kycFormData.city,
    country: "BRA",
    countryOfTaxId: "BRA",
    dateOfBirth: kycFormData.birthdate as unknown as string,
    email: kycFormData.email,
    fullName: kycFormData.fullName,
    state: kycFormData.state,
    streetAddress: `${kycFormData.street} ${kycFormData.number}`.trim(),
    taxIdNumber: taxId,
    uploadedDocumentId: documentUploadIds.uploadedDocumentId,
    uploadedSelfieId: documentUploadIds.uploadedSelfieId,
    zipCode: kycFormData.cep
  };

  let subAccountId: string;

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

  await submitNewKyc({ ...payload, subAccountId });
});
