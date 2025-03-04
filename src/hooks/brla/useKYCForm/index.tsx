import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import { ExtendedBrlaFieldOptions } from '../../../components/BrlaComponents/BrlaField';

const getEnumInitialValues = (enumType: Record<string, string>): Record<string, unknown> => {
  return Object.values(enumType).reduce((acc, field) => ({ ...acc, [field]: undefined }), {});
};

const kycFormSchema = yup
  .object({
    [ExtendedBrlaFieldOptions.PHONE]: yup
      .string()
      .required('Phone number is required')
      .matches(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number format'),

    [ExtendedBrlaFieldOptions.ADDRESS]: yup
      .string()
      .required('Address is required')
      .min(5, 'Address must be at least 5 characters'),

    [ExtendedBrlaFieldOptions.FULL_NAME]: yup
      .string()
      .required('Full name is required')
      .min(3, 'Name must be at least 3 characters')
      .matches(/^[a-zA-Z\s]*$/, 'Name can only contain letters and spaces'),

    [ExtendedBrlaFieldOptions.CPF]: yup
      .string()
      .required('CPF is required')
      .matches(/^\d{11}$/, 'CPF must be 11 digits'),

    [ExtendedBrlaFieldOptions.BIRTHDATE]: yup
      .date()
      .transform((value, originalValue) => {
        return originalValue === '' ? undefined : value;
      })
      .required('Birthdate is required')
      .max(new Date(), 'Birthdate cannot be in the future')
      .min(new Date(1900, 0, 1), 'Invalid birthdate'),
  })
  .required();

export type KYCFormData = yup.InferType<typeof kycFormSchema>;

export const useKYCForm = () => {
  const kycForm = useForm<KYCFormData>({
    resolver: yupResolver(kycFormSchema),
    mode: 'onBlur',
    defaultValues: getEnumInitialValues(ExtendedBrlaFieldOptions),
  });

  return { kycForm };
};
