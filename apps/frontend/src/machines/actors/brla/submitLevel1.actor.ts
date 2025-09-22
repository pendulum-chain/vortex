import { fromPromise } from "xstate";
import { submitNewKyc } from "../../../services/signingService";
import { AveniaKycContext } from "../../kyc.states";

export const submitActor = fromPromise(async ({ input }: { input: AveniaKycContext }): Promise<void> => {
  const { taxId, kycFormData, documentUploadIds, subAccountId } = input;

  if (
    !documentUploadIds ||
    !documentUploadIds.uploadedSelfieId ||
    !documentUploadIds.uploadedDocumentId ||
    !kycFormData ||
    !subAccountId
  ) {
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

  await submitNewKyc({ ...payload, subAccountId });
});
