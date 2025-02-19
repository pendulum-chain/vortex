import { useState, RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import { FeeComparisonRef } from '../FeeComparison';

interface PIXKYCFormProps {
  onBack: () => void;
  feeComparisonRef: RefObject<FeeComparisonRef | null>;
}

interface InitialFormData {
  taxId: string;
  pixId: string;
}

interface KYCFormData {
  phone: string;
  address: string;
  fullName: string;
  cpf: string;
  birthdate: string;
}

export const PIXKYCForm = ({ onBack, feeComparisonRef }: PIXKYCFormProps) => {
  const [showKYCForm, setShowKYCForm] = useState(false);

  const initialForm = useForm<InitialFormData>({
    defaultValues: {
      taxId: '',
      pixId: '',
    },
  });

  const kycForm = useForm<KYCFormData>({
    defaultValues: {
      phone: '',
      address: '',
      fullName: '',
      cpf: '',
      birthdate: '',
    },
  });

  const handleInitialSubmit = (data: InitialFormData) => {
    const taxIdExists = false; // Mock

    if (taxIdExists) {
      // TODO
    } else {
      setShowKYCForm(true);
    }
  };

  const handleKYCSubmit = (data: KYCFormData) => {
    // TODO
  };

  return (
    <motion.form
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 min-h-[480px] flex flex-col"
      onSubmit={showKYCForm ? kycForm.handleSubmit(handleKYCSubmit) : initialForm.handleSubmit(handleInitialSubmit)}
    >
      <h2 className="mt-2 mb-5 text-2xl font-bold text-center text-blue-700">
        {showKYCForm ? 'KYC Details' : 'PIX Details'}
      </h2>

      <p className="text-gray-400 mb-8">Which bank account should we send the funds to?</p>

      {!showKYCForm && (
        <>
          <div className="mb-4">
            <label htmlFor="taxId" className="block mb-1">
              Tax ID
            </label>
            <input
              id="taxId"
              {...initialForm.register('taxId', { required: true })}
              className="w-full p-2 rounded"
              placeholder="3eE4729a-123B-45c6-8d7e-F9aD567b9c1e"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="pixId" className="block mb-1">
              PIX ID
            </label>
            <input
              id="pixId"
              {...initialForm.register('pixId', { required: true })}
              className="w-full p-2 rounded"
              placeholder="123.456.789-00"
            />
          </div>
        </>
      )}

      {showKYCForm && (
        <>
          <div className="mb-4">
            <label htmlFor="phone" className="block mb-1">
              Phone Number
            </label>
            <input
              id="phone"
              {...kycForm.register('phone', { required: true })}
              className="w-full p-2 rounded"
              placeholder="Phone Number"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="address" className="block mb-1">
              Address
            </label>
            <input
              id="address"
              {...kycForm.register('address', { required: true })}
              className="w-full p-2 rounded"
              placeholder="Address"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="fullName" className="block mb-1">
              Full Name
            </label>
            <input
              id="fullName"
              {...kycForm.register('fullName', { required: true })}
              className="w-full p-2 rounded"
              placeholder="Full Name"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="cpf" className="block mb-1">
              CPF
            </label>
            <input
              id="cpf"
              {...kycForm.register('cpf', { required: true })}
              className="w-full p-2 rounded"
              placeholder="CPF"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="birthdate" className="block mb-1">
              Birthdate
            </label>
            <input
              id="birthdate"
              type="date"
              {...kycForm.register('birthdate', { required: true })}
              className="w-full p-2 rounded"
            />
          </div>
        </>
      )}

      <div className="grid gap-3 mt-8 mb-12">
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-vortex-primary-inverse btn flex-1"
            onClick={showKYCForm ? () => setShowKYCForm(false) : onBack}
          >
            Back
          </button>
          <button type="submit" className="btn-vortex-primary btn flex-1">
            {showKYCForm ? 'Continue' : 'Next'}
          </button>
          {/* TODO: We definitely should move the offramping state into a zustand store */}
          {/* TODO: Implement Submit Offramp button here  */}
        </div>
        <button
          type="button"
          className="btn-vortex-primary-inverse btn flex-1"
          onClick={() => feeComparisonRef.current?.scrollIntoView()}
        >
          Compare Fees
        </button>
      </div>
    </motion.form>
  );
};
