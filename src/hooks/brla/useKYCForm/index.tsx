import { ExtendedBrlaFieldOptions } from '../../../components/BrlaComponents/BrlaField';

import { useForm } from 'react-hook-form';

const getEnumInitialValues = (enumType: Record<string, string>): Record<string, string> => {
  return Object.values(enumType).reduce((acc, field) => ({ ...acc, [field]: '' }), {} as Record<string, string>);
};

export const useKYCForm = () => {
  const kycForm = useForm<Record<ExtendedBrlaFieldOptions, string>>({
    defaultValues: getEnumInitialValues(ExtendedBrlaFieldOptions),
  });

  return { kycForm };
};
