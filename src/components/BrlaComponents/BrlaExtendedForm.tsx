import { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { useKYCProcess } from '../../hooks/brla/useBRLAKYCProcess';
import { useKYCForm } from '../../hooks/brla/useKYCForm';

import { VerificationStatus } from './VerificationStatus';
import { BrlaFieldProps, ExtendedBrlaFieldOptions } from './BrlaField';
import { KYCForm } from './KYCForm';

interface PIXKYCFormProps {
  feeComparisonRef: RefObject<HTMLDivElement | null>;
}

export const PIXKYCForm = ({ feeComparisonRef }: PIXKYCFormProps) => {
  const { verificationStatus, statusMessage, handleFormSubmit, handleBackClick, isSubmitted } = useKYCProcess();

  const { kycForm } = useKYCForm();

  const { t } = useTranslation();

  const PIXKYCFORM_FIELDS: BrlaFieldProps[] = [
    {
      id: ExtendedBrlaFieldOptions.FULL_NAME,
      label: t('components.brlaExtendedForm.fullName'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.fullName'),
      required: true,
      index: 0,
    },
    {
      id: ExtendedBrlaFieldOptions.PHONE,
      label: t('components.brlaExtendedForm.phoneNumber'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.phoneNumber'),
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
      label: t('components.brlaExtendedForm.city'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.city'),
      required: true,
      index: 3,
    },
    {
      id: ExtendedBrlaFieldOptions.STATE,
      label: t('components.brlaExtendedForm.state'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.state'),
      required: true,
      index: 4,
    },
    {
      id: ExtendedBrlaFieldOptions.STREET,
      label: t('components.brlaExtendedForm.street'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.street'),
      required: true,
      index: 5,
    },
    {
      id: ExtendedBrlaFieldOptions.NUMBER,
      label: t('components.brlaExtendedForm.number'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.number'),
      required: true,
      index: 6,
    },
    {
      id: ExtendedBrlaFieldOptions.DISTRICT,
      label: t('components.brlaExtendedForm.district'),
      type: 'text',
      placeholder: t('components.brlaExtendedForm.district'),
      required: true,
      index: 7,
    },
    {
      id: ExtendedBrlaFieldOptions.BIRTHDATE,
      label: t('components.brlaExtendedForm.birthdate'),
      type: 'date',
      required: true,
      index: 8,
    },
  ];

  return (
    <div className="relative">
      {!isSubmitted ? (
        <KYCForm
          fields={PIXKYCFORM_FIELDS}
          form={kycForm}
          onSubmit={handleFormSubmit}
          onBackClick={handleBackClick}
          feeComparisonRef={feeComparisonRef}
        />
      ) : (
        <VerificationStatus status={verificationStatus} message={statusMessage} />
      )}
    </div>
  );
};
