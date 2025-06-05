import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useKYCProcess } from '../../hooks/brla/useBRLAKYCProcess';
import { useKYCForm } from '../../hooks/brla/useKYCForm';
import { isValidCnpj } from '../../hooks/ramp/schema';
import { useRampKycLevel2Started } from '../../stores/rampStore';

import { BrlaFieldProps, ExtendedBrlaFieldOptions } from './BrlaField';
import { KYCForm } from './KYCForm';
import { useKYCFormLocalStorage } from './KYCForm/useKYCFormLocalStorage';
import { DocumentUpload } from './KYCLevel2Form';
import { VerificationStatus } from './VerificationStatus';
import { useBrlaKycTaxIdLocalStorage } from './useBrlaKycTaxIdLocalStorage';

export const PIXKYCForm = () => {
  const {
    verificationStatus,
    statusMessage,
    handleFormSubmit: handleKYCFormSubmit,
    handleBackClick,
    setIsSubmitted,
    setCpf,
    isSubmitted,
  } = useKYCProcess();

  const rampKycLevel2Started = useRampKycLevel2Started();
  const { kycForm } = useKYCForm();
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

  if (!taxId) {
    return null;
  }

  const pixformFields: BrlaFieldProps[] = [
    {
      id: ExtendedBrlaFieldOptions.FULL_NAME,
      label: t('components.brlaExtendedForm.form.fullName'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.fullName'),
      required: true,
      index: 0,
    },
    {
      id: ExtendedBrlaFieldOptions.PHONE,
      label: t('components.brlaExtendedForm.form.phoneNumber'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.phoneNumber'),
      required: true,
      index: 1,
    },
    {
      id: ExtendedBrlaFieldOptions.CEP,
      label: 'CEP',
      type: 'text',
      placeholder: 'CEP',
      required: true,
      index: 2,
    },
    {
      id: ExtendedBrlaFieldOptions.CITY,
      label: t('components.brlaExtendedForm.form.city'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.city'),
      required: true,
      index: 3,
    },
    {
      id: ExtendedBrlaFieldOptions.STATE,
      label: t('components.brlaExtendedForm.form.state'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.state'),
      required: true,
      index: 4,
    },
    {
      id: ExtendedBrlaFieldOptions.STREET,
      label: t('components.brlaExtendedForm.form.street'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.street'),
      required: true,
      index: 5,
    },
    {
      id: ExtendedBrlaFieldOptions.NUMBER,
      label: t('components.brlaExtendedForm.form.number'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.number'),
      required: true,
      index: 6,
    },
    {
      id: ExtendedBrlaFieldOptions.DISTRICT,
      label: t('components.brlaExtendedForm.form.district'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.district'),
      required: true,
      index: 7,
    },
    {
      id: ExtendedBrlaFieldOptions.BIRTHDATE,
      label: t('components.brlaExtendedForm.form.birthdate'),
      type: 'date',
      required: true,
      index: 8,
    },
  ];

  if (isValidCnpj(taxId)) {
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.COMPANY_NAME,
      label: t('components.brlaExtendedForm.form.companyName'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.form.companyName'),
      required: true,
      index: 9,
    });
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.START_DATE,
      label: t('components.brlaExtendedForm.form.startDate'),
      type: 'date',
      required: true,
      index: 10,
    });
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.PARTNER_CPF,
      label: t('components.brlaExtendedForm.form.partnerCpf'),
      type: 'text',
      required: true,
      index: 11,
    });
  }

  if (isSubmitted) {
    return (
      <div className="relative">
        <VerificationStatus status={verificationStatus} message={statusMessage} isLevel2={rampKycLevel2Started} />
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
