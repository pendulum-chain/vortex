import { useTranslation } from 'react-i18next';

import { useKYCProcess } from '../../hooks/brla/useBRLAKYCProcess';
import { useKYCForm } from '../../hooks/brla/useKYCForm';

import { VerificationStatus } from './VerificationStatus';
import { BrlaFieldProps, ExtendedBrlaFieldOptions } from './BrlaField';
import { KYCForm } from './KYCForm';
import { useRampKycLevel2Started } from '../../stores/rampStore';
import { useCallback } from 'react';
import { DocumentUpload } from './KYCLevel2Form';
import { useTaxId } from '../../stores/ramp/useRampFormStore';
import { isValidCnpj } from '../../hooks/ramp/schema';

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

  const { t } = useTranslation();

  const taxId = useTaxId();

  const handleDocumentUploadSubmit = useCallback(() => {
    setIsSubmitted(true);
    const taxIdToSet = taxId || null;
    setCpf(taxIdToSet);
  }, [setIsSubmitted, setCpf, taxId]);

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

  if (!taxId) {
    return null;
  }

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
        <DocumentUpload onSubmitHandler={handleDocumentUploadSubmit} onBackClick={handleBackClick} />
      </div>
    );
  }

  return (
    <div className="relative">
      <KYCForm fields={pixformFields} form={kycForm} onSubmit={handleKYCFormSubmit} onBackClick={handleBackClick} />
    </div>
  );
};
