import { useKYCProcess } from '../../hooks/brla/useBRLAKYCProcess';
import { useKYCForm } from '../../hooks/brla/useKYCForm';

import { VerificationStatus } from './VerificationStatus';
import { BrlaFieldProps, ExtendedBrlaFieldOptions } from './BrlaField';
import { KYCForm } from './KYCForm';

const PIXKYCFORM_FIELDS: BrlaFieldProps[] = [
  {
    id: ExtendedBrlaFieldOptions.FULL_NAME,
    label: 'Full Name',
    type: 'text',
    placeholder: 'Full Name',
    required: true,
    index: 0,
  },
  {
    id: ExtendedBrlaFieldOptions.PHONE,
    label: 'Phone Number',
    type: 'text',
    placeholder: 'Phone Number',
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
    label: 'City',
    type: 'text',
    placeholder: 'City',
    required: true,
    index: 3,
  },
  {
    id: ExtendedBrlaFieldOptions.STATE,
    label: 'State',
    type: 'text',
    placeholder: 'State',
    required: true,
    index: 4,
  },
  {
    id: ExtendedBrlaFieldOptions.STREET,
    label: 'Street',
    type: 'text',
    placeholder: 'Street',
    required: true,
    index: 5,
  },
  {
    id: ExtendedBrlaFieldOptions.NUMBER,
    label: 'Number',
    type: 'text',
    placeholder: 'Number',
    required: true,
    index: 6,
  },
  {
    id: ExtendedBrlaFieldOptions.DISTRICT,
    label: 'District',
    type: 'text',
    placeholder: 'District',
    required: true,
    index: 7,
  },
  {
    id: ExtendedBrlaFieldOptions.BIRTHDATE,
    label: 'Birthdate',
    type: 'date',
    required: true,
    index: 8,
  },
];

export const PIXKYCForm = () => {
  const { verificationStatus, statusMessage, handleFormSubmit, handleBackClick, isSubmitted } = useKYCProcess();

  const { kycForm } = useKYCForm();

  return (
    <div className="relative">
      {!isSubmitted ? (
        <KYCForm
          fields={PIXKYCFORM_FIELDS}
          form={kycForm}
          onSubmit={handleFormSubmit}
          onBackClick={handleBackClick}
        />
      ) : (
        <VerificationStatus status={verificationStatus} message={statusMessage} />
      )}
    </div>
  );
};
