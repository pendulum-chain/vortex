import { AveniaAccountType, isValidCnpj, KycAttemptResult, KycAttemptStatus, KycFailureReason } from "@vortexfi/shared";
import { fromPromise } from "xstate";
import type { AveniaKycApi, KybLevel1Response } from "./api";
import type { AveniaKycContext, VerifyStatusActorOutput } from "./types";

const POLLING_INTERVAL_MS = 2000;
const MAX_FAILURES = 10;

export type CreateSubaccountActorOutput = {
  subAccountId: string;
  maybeKycAttemptStatus?: Awaited<ReturnType<AveniaKycApi["getKycStatus"]>>;
  isCompany: boolean;
  kybUrls?: KybLevel1Response;
};

export function createSubaccountActor(api: AveniaKycApi) {
  return fromPromise(async ({ input }: { input: AveniaKycContext }): Promise<CreateSubaccountActorOutput> => {
    const { taxId, kycFormData, quoteId } = input;
    const isCompany = isValidCnpj(taxId);

    let subAccountId: string;
    let maybeKycAttemptStatus: Awaited<ReturnType<AveniaKycApi["getKycStatus"]>> | undefined;
    let kybUrls: KybLevel1Response | undefined;

    if (!kycFormData) {
      throw new Error("Invalid input state. This is a Bug.");
    }
    try {
      ({ subAccountId } = await api.getUser(taxId));

      if (quoteId) {
        try {
          maybeKycAttemptStatus = await api.getKycStatus(taxId, quoteId, input.externalSessionId);
        } catch (e) {
          console.log("Debug: could not fetch kyc status", e);
        }
      }

      if (isCompany) {
        try {
          kybUrls = await api.initiateKybLevel1(subAccountId);
        } catch (e) {
          console.log("Debug: failed to initiate KYB Level 1", e);
        }
      }

      if (maybeKycAttemptStatus?.status === KycAttemptStatus.PROCESSING) {
        return { isCompany, kybUrls, maybeKycAttemptStatus, subAccountId };
      }

      return { isCompany, kybUrls, subAccountId };
    } catch (error: unknown) {
      console.log("Debug: failed to fetch existing Avenia subaccount", error);
      const nameToUse = isCompany && kycFormData.companyName ? kycFormData.companyName : kycFormData.fullName;

      if (!nameToUse) {
        throw new Error("createSubaccountActor: Missing name for subaccount creation");
      }

      const accountType = isCompany ? AveniaAccountType.COMPANY : AveniaAccountType.INDIVIDUAL;

      ({ subAccountId } = await api.createSubaccount({
        accountType,
        name: nameToUse,
        quoteId,
        sessionId: input.externalSessionId,
        taxId
      }));

      if (isCompany) {
        try {
          kybUrls = await api.initiateKybLevel1(subAccountId);
        } catch (e) {
          console.log("Debug: failed to initiate KYB Level 1 for new account", e);
        }
      }

      return { isCompany, kybUrls, subAccountId };
    }
  });
}

export function createSubmitActor(api: AveniaKycApi) {
  return fromPromise(async ({ input }: { input: AveniaKycContext }): Promise<void> => {
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

    await api.submitNewKyc({
      city: kycFormData.city,
      country: "BRA",
      countryOfTaxId: "BRA",
      dateOfBirth: kycFormData.birthdate,
      email: kycFormData.email,
      fullName: kycFormData.fullName,
      state: kycFormData.state,
      streetAddress: `${kycFormData.street} ${kycFormData.number}`.trim(),
      subAccountId,
      taxIdNumber: taxId,
      uploadedDocumentId: documentUploadIds.uploadedDocumentId,
      uploadedSelfieId: documentUploadIds.uploadedSelfieId,
      zipCode: kycFormData.cep
    });
  });
}

export function createVerifyStatusActor(api: AveniaKycApi) {
  return fromPromise<VerifyStatusActorOutput, AveniaKycContext>(async ({ input }) => {
    const { taxId } = input;
    if (!taxId) {
      throw new Error("Tax ID is required");
    }

    return new Promise((resolve, reject) => {
      let failureCount = 0;
      const interval = setInterval(async () => {
        try {
          const response = await api.getKycStatus(taxId, input.quoteId || "", input.externalSessionId);
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
}
