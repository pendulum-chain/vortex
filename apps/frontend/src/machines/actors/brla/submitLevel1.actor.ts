import { fromPromise } from "xstate";
import { submitNewKyc } from "../../../services/signingService";
import { BrlaKycContext } from "../../kyc.states";

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const submitActor = fromPromise(async ({ input }: { input: BrlaKycContext }) => {
  const { taxId, kycFormData, documentUploadIds } = input;

  if (!documentUploadIds || !documentUploadIds.uploadedSelfieId || !documentUploadIds.uploadedDocumentId || !kycFormData) {
    throw new Error("Invalid input state. This is a Bug.");
  }

  const payload = {
    city: kycFormData.city,
    country: "BRA",
    countryOfTaxId: "BRA",
    dateOfBirth: formatDate(kycFormData.birthdate),
    email: "john.doe@example.com", // Mocking email as it is not in the form
    fullName: kycFormData.fullName,
    state: kycFormData.state,
    streetAddress: `${kycFormData.street} ${kycFormData.number}`.trim(),
    taxIdNumber: taxId,
    uploadedDocumentId: documentUploadIds.uploadedDocumentId,
    uploadedSelfieId: documentUploadIds.uploadedSelfieId,
    zipCode: kycFormData.cep
  };

  await submitNewKyc(payload);
});
