import { AveniaAccountType } from "@packages/shared/src/services";
import { fromPromise } from "xstate";
import { createSubaccount, submitNewKyc } from "../../../services/signingService";
import { AveniaKycContext } from "../../kyc.states";

export const submitActor = fromPromise(async ({ input }: { input: AveniaKycContext }) => {
  const { taxId, kycFormData, documentUploadIds } = input;

  if (!documentUploadIds || !documentUploadIds.uploadedSelfieId || !documentUploadIds.uploadedDocumentId || !kycFormData) {
    throw new Error("Invalid input state. This is a Bug.");
  }

  let payload = {
    city: kycFormData.city,
    country: "BRA",
    countryOfTaxId: "BRA",
    dateOfBirth: "1990-01-01", // TODO format date to string
    email: "john.doe@example.com", // Mocking email as it is not in the form
    fullName: kycFormData.fullName,
    state: kycFormData.state,
    streetAddress: `${kycFormData.street} ${kycFormData.number}`.trim(),
    taxIdNumber: taxId,
    uploadedDocumentId: documentUploadIds.uploadedDocumentId,
    uploadedSelfieId: documentUploadIds.uploadedSelfieId,
    zipCode: kycFormData.cep
  };

  const { subAccountId } = await createSubaccount({
    accountType: AveniaAccountType.INDIVIDUAL,
    name: kycFormData.fullName,
    taxId
  });

  await submitNewKyc({ ...payload, subAccountId });
});
