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

    [ExtendedBrlaFieldOptions.FULL_NAME]: yup
      .string()
      .required('Full name is required')
      .min(3, 'Name must be at least 3 characters')
      .matches(/^[a-zA-Z\s]*$/, 'Name can only contain letters and spaces'),

    [ExtendedBrlaFieldOptions.CEP]: yup
      .string()
      .required('CEP is required')
      .min(3, 'CEP must be at least 3 characters'),

    [ExtendedBrlaFieldOptions.CITY]: yup
      .string()
      .required('City is required')
      .min(5, 'City must be at least 5 characters'),

    [ExtendedBrlaFieldOptions.STATE]: yup
      .string()
      .required('State is required')
      .min(3, 'State must be at least 3 characters'),

    [ExtendedBrlaFieldOptions.STREET]: yup
      .string()
      .required('Street is required')
      .min(5, 'Street must be at least 5 characters'),

    [ExtendedBrlaFieldOptions.NUMBER]: yup.string().required('Number is required'),

    [ExtendedBrlaFieldOptions.DISTRICT]: yup
      .string()
      .required('District is required')
      .min(3, 'District must be at least 3 characters'),

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
