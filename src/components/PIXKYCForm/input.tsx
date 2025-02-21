import { FC, useEffect } from 'react';
import { UseFormReturn, useFormState } from 'react-hook-form';
import { SwapFormValues } from '../Nabla/schema';
import { OutputTokenType } from '../../constants/tokenConfig';

interface BrlaInputProps {
  form: UseFormReturn<SwapFormValues>;
  toToken: OutputTokenType;
}

export const BrlaInput: FC<BrlaInputProps> = ({ form, toToken }) => {
  const { register } = form;
  const { errors } = useFormState({ control: form.control });

  if (toToken !== 'brl') return null;

  return (
    <div>
      <h2 className="mt-2 mb-5 text-2xl font-bold text-center text-blue-700">PIX Details</h2>
      <p className="text-gray-400 mb-8">Which bank account should we send the funds to?</p>
      <div className="mb-4">
        <label htmlFor="taxId" className="block mb-1">
          Tax ID
        </label>
        <input
          id="taxId"
          {...register('taxId', { required: true })}
          className={`w-full p-2 rounded ${errors.taxId ? 'border border-red-500' : ''}`}
          placeholder=""
        />
      </div>
      <div className="mb-4">
        <label htmlFor="pixId" className="block mb-1">
          PIX ID
        </label>
        <input
          id="pixId"
          {...register('pixId', { required: true })}
          className={`w-full p-2 rounded ${errors.pixId ? 'border border-red-500' : ''}`}
          placeholder=""
        />
      </div>
    </div>
  );
};
