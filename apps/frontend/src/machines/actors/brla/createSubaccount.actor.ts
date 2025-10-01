import { AveniaAccountType, BrlaGetKycStatusResponse, isValidCnpj, KycAttemptStatus } from "@packages/shared";
import { fromPromise } from "xstate";
import { BrlaService, KybLevel1Response } from "../../../services/api";
import { createSubaccount, fetchKycStatus } from "../../../services/signingService";
import { AveniaKycContext } from "../../kyc.states";

export const createSubaccountActor = fromPromise(
  async ({
    input
  }: {
    input: AveniaKycContext;
  }): Promise<{
    subAccountId: string;
    maybeKycAttemptStatus?: BrlaGetKycStatusResponse;
    isCompany: boolean;
    kybUrls?: KybLevel1Response;
  }> => {
    const { taxId, kycFormData } = input;

    // Determine if this is a company (CNPJ) or individual (CPF)
    const isCompany = isValidCnpj(taxId);
    console.log("createSubaccountActor: isCompany (CNPJ)", isCompany);

    let subAccountId: string;
    let maybeKycAttemptStatus: BrlaGetKycStatusResponse | undefined;
    let kybUrls: KybLevel1Response | undefined;

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

      if (isCompany) {
        console.log("Debug: This is a company account. Initiating KYB Level 1...");
        try {
          kybUrls = await BrlaService.initiateKybLevel1(subAccountId);
        } catch (e) {
          console.log("Debug: failed to initiate KYB Level 1", e);
        }
      } else {
        console.log("Debug: This is an individual account. Skipping KYB Level 1.");
      }

      if (
        maybeKycAttemptStatus?.status === KycAttemptStatus.PENDING ||
        maybeKycAttemptStatus?.status === KycAttemptStatus.PROCESSING
      ) {
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

      ({ subAccountId } = await createSubaccount({
        accountType,
        name: nameToUse,
        taxId
      }));

      if (isCompany) {
        console.log("Debug: This is a company account (CNPJ). Initiating KYB Level 1 for new account...");
        try {
          kybUrls = await BrlaService.initiateKybLevel1(subAccountId);
          console.log("Debug: KYB Level 1 initiated successfully for new account:", kybUrls);
        } catch (e) {
          console.log("Debug: failed to initiate KYB Level 1 for new account", e);
        }
      } else {
        console.log("Debug: This is an individual account (CPF). Skipping KYB Level 1.");
      }

      return { isCompany, kybUrls, subAccountId };
    }
  }
);
