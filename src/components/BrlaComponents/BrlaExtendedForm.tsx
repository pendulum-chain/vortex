import { RefObject } from 'react';

import { useKYCProcess } from '../../hooks/brla/useBRLAKYCProcess';
import { useKYCForm } from '../../hooks/brla/useKYCForm';

import { FeeComparisonRef } from '../FeeComparison';
import { VerificationStatus } from './VerificationStatus';
import { BrlaFieldProps, ExtendedBrlaFieldOptions } from './BrlaField';
import { KYCForm } from './KYCForm';

interface PIXKYCFormProps {
  feeComparisonRef: RefObject<FeeComparisonRef | null>;
  setIsOfframpSummaryDialogVisible: (isVisible: boolean) => void;
  onSwapConfirm: () => void;
}

const PIXKYCFORM_FIELDS: BrlaFieldProps[] = [
  {
    id: ExtendedBrlaFieldOptions.PHONE,
    label: 'Phone Number',
    type: 'text',
    placeholder: 'Phone Number',
    required: true,
    index: 0,
  },
  {
    id: ExtendedBrlaFieldOptions.ADDRESS,
    label: 'Address',
    type: 'text',
    placeholder: 'Address',
    required: true,
    index: 1,
  },
  {
    id: ExtendedBrlaFieldOptions.FULL_NAME,
    label: 'Full Name',
    type: 'text',
    placeholder: 'Full Name',
    required: true,
    index: 2,
  },
  {
    id: ExtendedBrlaFieldOptions.CPF,
    label: 'CPF',
    type: 'text',
    placeholder: 'CPF',
    validationPattern: {
      value: /^\d{11}$/,
      message: 'CPF must be 11 digits',
    },
    required: true,
    index: 3,
  },
  {
    id: ExtendedBrlaFieldOptions.BIRTHDATE,
    label: 'Birthdate',
    type: 'date',
    required: true,
    index: 4,
  },
];

export const PIXKYCForm = ({ feeComparisonRef, setIsOfframpSummaryDialogVisible }: PIXKYCFormProps) => {
  const { verificationStatus, statusMessage, handleFormSubmit, handleBackClick, isSubmitted } = useKYCProcess(
    setIsOfframpSummaryDialogVisible,
  );

  const { kycForm } = useKYCForm();

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
