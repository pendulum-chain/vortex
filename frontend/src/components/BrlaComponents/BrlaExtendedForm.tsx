import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

import { useKYCProcess } from '../../hooks/brla/useBRLAKYCProcess';
import { useKYCForm } from '../../hooks/brla/useKYCForm';
import { isValidCnpj } from '../../hooks/ramp/schema';
import { useRampKycLevel2Started } from '../../stores/rampStore';

import { useBrlaKycTaxIdLocalStorage } from './useBrlaKycTaxIdLocalStorage';
import { BrlaFieldProps, ExtendedBrlaFieldOptions } from './BrlaField';
import { VerificationStatus } from './VerificationStatus';
import { DocumentUpload } from './KYCLevel2Form';
import { KYCForm } from './KYCForm';
import { useKYCFormLocalStorage } from './KYCForm/useKYCFormLocalStorage';

export const PIXKYCForm = () => {
  const {
    verificationStatus,
    statusMessage,
    failureMessage,
    handleFormSubmit: handleKYCFormSubmit,
    cpfApiError,
    handleBackClick,
    setIsSubmitted,
    setCpf,
    isSubmitted,
    kycVerificationError,
    proceedWithRamp,
    resetToDefault,
  } = useKYCProcess();

  const rampKycLevel2Started = useRampKycLevel2Started();
  const { kycForm } = useKYCForm({cpfApiError});
  const { clearStorage } = useKYCFormLocalStorage(kycForm);

  const { t } = useTranslation();

  const { taxId, clearTaxId } = useBrlaKycTaxIdLocalStorage();

  const handleDocumentUploadSubmit = useCallback(() => {
    if (!taxId) {
      return;
    }

    setIsSubmitted(true);
    setCpf(taxId);
  }, [setIsSubmitted, setCpf, taxId]);

  const handleRetryDocumentUpload = useCallback(() => {
    // Clear documents from memory and go back to document upload.
    // Clear kyc pending status.
    setIsSubmitted(false);
    resetToDefault();
  }, [setIsSubmitted]);

  if (!taxId) {
    return null;
  }

  const pixformFields: BrlaFieldProps[] = [
    {
      id: ExtendedBrlaFieldOptions.TAX_ID,
      label: t('components.brlaExtendedForm.form.taxId'),
      type: 'text',
      required: true,
      index: 0,
    },
    {
      id: ExtendedBrlaFieldOptions.FULL_NAME,
      label: t('components.brlaExtendedForm.form.fullName'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.fullName'),
      required: true,
      index: 1,
    },
    {
      id: ExtendedBrlaFieldOptions.PHONE,
      label: t('components.brlaExtendedForm.form.phoneNumber'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.phoneNumber'),
      required: true,
      index: 2,
    },
    {
      id: ExtendedBrlaFieldOptions.CEP,
      label: 'CEP',
      type: 'text',
      placeholder: 'CEP',
      required: true,
      index: 3,
    },
    {
      id: ExtendedBrlaFieldOptions.CITY,
      label: t('components.brlaExtendedForm.form.city'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.city'),
      required: true,
      index: 4,
    },
    {
      id: ExtendedBrlaFieldOptions.STATE,
      label: t('components.brlaExtendedForm.form.state'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.state'),
      required: true,
      index: 5,
    },
    {
      id: ExtendedBrlaFieldOptions.STREET,
      label: t('components.brlaExtendedForm.form.street'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.street'),
      required: true,
      index: 6,
    },
    {
      id: ExtendedBrlaFieldOptions.NUMBER,
      label: t('components.brlaExtendedForm.form.number'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.number'),
      required: true,
      index: 7,
    },
    {
      id: ExtendedBrlaFieldOptions.DISTRICT,
      label: t('components.brlaExtendedForm.form.district'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.district'),
      required: true,
      index: 8,
    },
    {
      id: ExtendedBrlaFieldOptions.BIRTHDATE,
      label: t('components.brlaExtendedForm.form.birthdate'),
      type: 'date',
      required: true,
      index: 9,
    },
  ];

  if (isValidCnpj(taxId)) {
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.COMPANY_NAME,
      label: t('components.brlaExtendedForm.form.companyName'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.companyName'),
      required: true,
      index: 10,
    });
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.START_DATE,
      label: t('components.brlaExtendedForm.form.startDate'),
      type: 'date',
      required: true,
      index: 11,
    });
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.PARTNER_CPF,
      label: t('components.brlaExtendedForm.form.partnerCpf'),
      type: 'text',
      required: true,
      index: 12,
    });
  }

  if (isSubmitted) {
    return (
      <div className="relative">
        <VerificationStatus 
          status={verificationStatus} 
          message={statusMessage} 
          failureMessage={failureMessage}
          isLevel2={rampKycLevel2Started}
          onContinue={proceedWithRamp}
          onBackClick={handleBackClick}
          onRetry={handleRetryDocumentUpload}
          kycVerificationError={kycVerificationError}
        />
      </div>
    );
  }

  if (rampKycLevel2Started) {
    return (
      <div className="relative">
        <DocumentUpload
          onSubmitHandler={() => {
            handleDocumentUploadSubmit();
            clearTaxId();
          }}
          onBackClick={handleBackClick}
          taxId={taxId}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <KYCForm
        fields={pixformFields}
        form={kycForm}
        onSubmit={async (formData) => {
          await handleKYCFormSubmit(formData);
          clearStorage();
        }}
        onBackClick={() => {
          handleBackClick();
          clearTaxId();
          clearStorage();
        }}
      />
    </div>
  );
};
