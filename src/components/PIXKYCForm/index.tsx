import { RefObject, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import { FeeComparisonRef } from '../FeeComparison';
import { performSwapInitialChecks } from '../../pages/swap/helpers/swapConfirm/performSwapInitialChecks';
import { useSubmitOfframp } from '../../hooks/offramp/useSubmitOfframp';
import { useOfframpActions, useOfframpExecutionInput } from '../../stores/offrampStore';

interface PIXKYCFormProps {
  feeComparisonRef: RefObject<FeeComparisonRef | null>;
}

interface KYCFormData {
  phone: string;
  address: string;
  fullName: string;
  cpf: string;
  birthdate: string;
}

export const PIXKYCForm = ({ feeComparisonRef }: PIXKYCFormProps) => {
  const { setOfframpInitiating, setOfframpKycStarted, resetOfframpState } = useOfframpActions();
  const executionInput = useOfframpExecutionInput();
  const submitOfframp = useSubmitOfframp();
  const kycForm = useForm<KYCFormData>({
    defaultValues: {
      phone: '',
      address: '',
      fullName: '',
      cpf: '',
      birthdate: '',
    },
  });

  const handleKYCSubmit = (data: KYCFormData) => {
    // TODO
    handleKycReady();
  };

  const handleKycReady = useCallback(() => {
    if (!executionInput) {
      console.log('No execution input found');
      return;
    }
    performSwapInitialChecks()
      .then(() => {
        console.log('Initial checks completed after Kyc. Starting process..');
        submitOfframp(executionInput);
      })
      .catch((_error) => {
        console.error('Error during swap confirmation:', _error);
        setOfframpInitiating(false);
        executionInput?.setInitializeFailed();
      })
      .finally(() => {
        setOfframpKycStarted(false);
      });
  }, [executionInput, setOfframpInitiating, setOfframpKycStarted, submitOfframp]);

  const onBackClick = () => {
    setOfframpKycStarted(false);
    resetOfframpState();
  };

  return (
    <motion.form
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 min-h-[480px] flex flex-col"
      onSubmit={kycForm.handleSubmit(handleKYCSubmit)}
    >
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

        <div className="grid gap-3 mt-8 mb-12">
          <div className="flex gap-3">
            <button type="button" className="btn-vortex-primary-inverse btn flex-1" onClick={onBackClick}>
              Back
            </button>
            <button type="submit" className="btn-vortex-primary btn flex-1">
              {'Continue'}
            </button>
          </div>
          <button
            type="button"
            className="btn-vortex-primary-inverse btn flex-1"
            onClick={() => feeComparisonRef.current?.scrollIntoView()}
          >
            Compare Fees
          </button>
        </div>
      </>
    </motion.form>
  );
};
