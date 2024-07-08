import { UseFormRegisterReturn } from 'react-hook-form';
import { FC } from 'preact/compat';
import { LabeledInput } from '../../../components/LabeledInput';
import { SwapFormValues } from '../../../components/Nabla/schema';
import { TextInput } from '../../../components/TextInput';

interface BankDetailsProps {
  registerBankAccount: UseFormRegisterReturn<SwapFormValues['bankAccount']>;
  registerTaxNumber: UseFormRegisterReturn<SwapFormValues['taxNumber']>;
}

export const BankDetails: FC<BankDetailsProps> = ({ registerBankAccount, registerTaxNumber }) => (
  <section>
    <div className="h-0.5 m-auto w-1/5 bg-pink-500 mt-8 mb-5" />
    <h2 className="text-2xl text-blue-700 font-bold text-center mb-5">Bank transfer details</h2>
    <p className="font-thin text-center my-5 text-gray-400">Which bank account should we send the funds to?</p>
    <LabeledInput
      label="Bank Account / PIX ID"
      Input={() => <TextInput register={registerBankAccount} placeholder="3eE4729a-123B-45c6-8d7e-F9aD567b9c1e" />}
    />
    <div className="mt-5" />
    <LabeledInput
      label="Tax Number / CPF"
      Input={() => <TextInput register={registerTaxNumber} placeholder="123.456.789-00" />}
    />
  </section>
);
