import { RefObject, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import { FeeComparisonRef } from '../FeeComparison';
import { performSwapInitialChecks } from '../../pages/swap/helpers/swapConfirm/performSwapInitialChecks';
import { useSubmitOfframp } from '../../hooks/offramp/useSubmitOfframp';
import { useOfframpActions, useOfframpExecutionInput } from '../../stores/offrampStore';
import { fetchKycStatus } from '../../services/signingService';

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

const Spinner = () => (
  <motion.svg
    className="w-16 h-16"
    viewBox="0 0 50 50"
    initial={{ rotate: 0 }}
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
  >
    <defs>
      <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#3B82F6" />
      </linearGradient>
    </defs>
    <circle cx="25" cy="25" r="20" fill="none" stroke="url(#spinnerGradient)" strokeWidth="5" strokeDasharray="31.4" />
  </motion.svg>
);

export const PIXKYCForm = ({ feeComparisonRef }: PIXKYCFormProps) => {
  const { setOfframpInitiating, setOfframpKycStarted, resetOfframpState } = useOfframpActions();
  const executionInput = useOfframpExecutionInput();
  const submitOfframp = useSubmitOfframp();
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const kycForm = useForm<KYCFormData>({
    defaultValues: {
      phone: '',
      address: '',
      fullName: '',
      cpf: '',
      birthdate: '',
    },
  });

  const handleKycReady = useCallback(() => {
    if (!executionInput) {
      console.log('No execution input found');
      return;
    }
    performSwapInitialChecks()
      .then(() => {
        console.log('Initial checks completed after KYC. Starting process..');
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

  const pollKycStatus = async (): Promise<'validated' | 'rejected'> => {
    while (true) {
      const statusResult = await fetchKycStatus(kycForm.getValues('cpf'));
      if (statusResult.status === 'FAILED') {
        return 'rejected';
      } else if (statusResult.status === 'SUCCESS') {
        return 'validated';
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };

  const handleKYCSubmit = async (data: KYCFormData) => {
    setIsVerifying(true);
    setStatusMessage('Estamos verificando seus dados, aguarde');

    try {
      const result = await pollKycStatus();
      if (result === 'validated') {
        setStatusMessage('Você foi validado');
        setTimeout(() => {
          setIsVerifying(false);
          handleKycReady();
        }, 5000);
      } else if (result === 'rejected') {
        setStatusMessage('Seu kyc foi rejeitado');
        setTimeout(() => {
          setIsVerifying(false);
          onBackClick();
        }, 3000);
      }
    } catch (error) {
      console.error('Error during KYC polling:', error);
      setIsVerifying(false);
      onBackClick();
    }
  };

  return (
    <div className="relative">
      <motion.form
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 min-h-[480px] flex flex-col"
        onSubmit={kycForm.handleSubmit(handleKYCSubmit)}
      >
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
              Continue
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
      </motion.form>
      {isVerifying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-80 z-10">
          <Spinner />
          <p className="mt-4 text-lg font-bold">{statusMessage}</p>
        </div>
      )}
    </div>
  );
};
