import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useKYCProcess } from "../../hooks/brla/useBRLAKYCProcess";
import { useKYCForm } from "../../hooks/brla/useKYCForm";
import { isValidCnpj } from "../../hooks/ramp/schema";

import { BrlaFieldProps, ExtendedBrlaFieldOptions } from "./BrlaField";
import { KYCForm } from "./KYCForm";
import { useKYCFormLocalStorage } from "./KYCForm/useKYCFormLocalStorage";
import { DocumentUpload } from "./KYCLevel2Form";
import { useBrlaKycPixKeyLocalStorage } from "./useBrlaKycPixKeyLocalStorage";
import { useBrlaKycTaxIdLocalStorage } from "./useBrlaKycTaxIdLocalStorage";
import { VerificationStatus } from "./VerificationStatus";

export const PIXKYCForm = () => {
  // const {
  //   verificationStatus,
  //   statusMessage,
  //   failureMessage,
  //   handleFormSubmit: handleKYCFormSubmit,
  //   cpfApiError,
  //   handleBackClick,
  //   setIsSubmitted,
  //   setCpf,
  //   isSubmitted,
  //   kycVerificationError,
  //   proceedWithRamp,
  //   resetToDefault
  // } = useKYCProcess();

  // const rampKycLevel2Started = false; // XSTATE TODO: Refactor after BRLA's new API is defined.
  // const { kycForm } = useKYCForm({ cpfApiError });
  // const { clearStorage } = useKYCFormLocalStorage(kycForm);

  // const { t } = useTranslation();

  // const { taxId, clearTaxId } = useBrlaKycTaxIdLocalStorage();
  // const { clearPixId } = useBrlaKycPixKeyLocalStorage();

  // const handleDocumentUploadSubmit = useCallback(() => {
  //   if (!taxId) {
  //     return;
  //   }

  // }, [setIsSubmitted, setCpf, taxId]);

  // const handleRetryDocumentUpload = useCallback(() => {
  //   resetToDefault();
  // }, [setIsSubmitted, resetToDefault]);

  // if (!taxId) {
  //   return null;
  // }

  // const pixformFields: BrlaFieldProps[] = [
  //   {
  //     id: ExtendedBrlaFieldOptions.TAX_ID,
  //     index: 0,
  //     label: t("components.brlaExtendedForm.form.taxId"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.PIX_ID,
  //     index: 1,
  //     label: t("components.brlaExtendedForm.form.pixId"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.FULL_NAME,
  //     index: 1,
  //     label: t("components.brlaExtendedForm.form.fullName"),
  //     placeholder: t("components.brlaExtendedForm.form.fullName"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.PHONE,
  //     index: 2,
  //     label: t("components.brlaExtendedForm.form.phoneNumber"),
  //     placeholder: t("components.brlaExtendedForm.form.phoneNumber"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.CEP,
  //     index: 3,
  //     label: "CEP",
  //     placeholder: "CEP",
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.CITY,
  //     index: 4,
  //     label: t("components.brlaExtendedForm.form.city"),
  //     placeholder: t("components.brlaExtendedForm.form.city"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.STATE,
  //     index: 5,
  //     label: t("components.brlaExtendedForm.form.state"),
  //     placeholder: t("components.brlaExtendedForm.form.state"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.STREET,
  //     index: 6,
  //     label: t("components.brlaExtendedForm.form.street"),
  //     placeholder: t("components.brlaExtendedForm.form.street"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.NUMBER,
  //     index: 7,
  //     label: t("components.brlaExtendedForm.form.number"),
  //     placeholder: t("components.brlaExtendedForm.form.number"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.DISTRICT,
  //     index: 8,
  //     label: t("components.brlaExtendedForm.form.district"),
  //     placeholder: t("components.brlaExtendedForm.form.district"),
  //     required: true,
  //     type: "text"
  //   },
  //   {
  //     id: ExtendedBrlaFieldOptions.BIRTHDATE,
  //     index: 9,
  //     label: t("components.brlaExtendedForm.form.birthdate"),
  //     required: true,
  //     type: "date"
  //   }
  // ];

  // if (isValidCnpj(taxId)) {
  //   pixformFields.push({
  //     id: ExtendedBrlaFieldOptions.COMPANY_NAME,
  //     index: 10,
  //     label: t("components.brlaExtendedForm.form.companyName"),
  //     placeholder: t("components.brlaExtendedForm.form.companyName"),
  //     required: true,
  //     type: "text"
  //   });
  //   pixformFields.push({
  //     id: ExtendedBrlaFieldOptions.START_DATE,
  //     index: 11,
  //     label: t("components.brlaExtendedForm.form.startDate"),
  //     required: true,
  //     type: "date"
  //   });
  //   pixformFields.push({
  //     id: ExtendedBrlaFieldOptions.PARTNER_CPF,
  //     index: 12,
  //     label: t("components.brlaExtendedForm.form.partnerCpf"),
  //     required: true,
  //     type: "text"
  //   });
  // }

  // if (isSubmitted) {
  //   return (
  //     <div className="relative">
  //       <VerificationStatus
  //         failureMessage={failureMessage}
  //         isLevel2={rampKycLevel2Started}
  //         kycVerificationError={kycVerificationError}
  //         message={statusMessage}
  //         onBack={handleBackClick}
  //         onContinue={proceedWithRamp}
  //         onRetry={handleRetryDocumentUpload}
  //         status={verificationStatus}
  //       />
  //     </div>
  //   );
  // }

  // if (rampKycLevel2Started) {
  //   return (
  //     <div className="relative">
  //       <DocumentUpload
  //         onBackClick={handleBackClick}
  //         onSubmitHandler={() => {
  //           handleDocumentUploadSubmit();
  //           clearTaxId();
  //           clearPixId();
  //         }}
  //         taxId={taxId}
  //       />
  //     </div>
  //   );
  // }

  // return (
  //   <div className="relative">
  //     <KYCForm
  //       fields={pixformFields}
  //       form={kycForm}
  //       onBackClick={() => {
  //         handleBackClick();
  //         clearTaxId();
  //         clearPixId();
  //         clearStorage();
  //       }}
  //       onSubmit={async formData => {
  //         await handleKYCFormSubmit(formData);
  //         clearStorage();
  //       }}
  //     />
  //   </div>
  // );
  return <div></div>;
};
