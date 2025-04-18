import { useTranslation } from 'react-i18next';

import { useKYCProcess } from '../../hooks/brla/useBRLAKYCProcess';
import { useKYCForm } from '../../hooks/brla/useKYCForm';

import { VerificationStatus } from './VerificationStatus';
import { BrlaFieldProps, ExtendedBrlaFieldOptions } from './BrlaField';
import { KYCForm } from './KYCForm';

export const PIXKYCForm = () => {
  const { verificationStatus, statusMessage, handleFormSubmit, handleBackClick, isSubmitted } = useKYCProcess();

  const { kycForm } = useKYCForm();

  const { t } = useTranslation();

  const PIXKYCFORM_FIELDS: BrlaFieldProps[] = [
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

  return (
    <div className="relative">
      {!isSubmitted ? (
        <KYCForm fields={PIXKYCFORM_FIELDS} form={kycForm} onSubmit={handleFormSubmit} onBackClick={handleBackClick} />
      ) : (
        <VerificationStatus status={verificationStatus} message={statusMessage} />
      )}
    </div>
  );
};
