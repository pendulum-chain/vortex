import { RefObject, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';

import { performSwapInitialChecks } from '../../pages/swap/helpers/swapConfirm/performSwapInitialChecks';
import { useOfframpActions, useOfframpExecutionInput } from '../../stores/offrampStore';
import { useSubmitOfframp } from '../../hooks/offramp/useSubmitOfframp';
import { fetchKycStatus } from '../../services/signingService';
import { FeeComparisonRef } from '../FeeComparison';
import { Spinner } from '../Spinner';
import { Input } from '../Input';

enum KYCStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
}

enum KYCResult {
  VALIDATED = 'validated',
  REJECTED = 'rejected',
}

interface PIXKYCFormProps {
  feeComparisonRef: RefObject<FeeComparisonRef | null>;
  setIsOfframpSummaryDialogVisible: (isVisible: boolean) => void;
}

interface KYCFormData {
  phone: string;
  address: string;
  fullName: string;
  cpf: string;
  birthdate: string;
}

const POLLING_INTERVAL_MS = 2000;
const VALIDATION_SUCCESS_DELAY_MS = 5000;
const VALIDATION_FAILURE_DELAY_MS = 3000;

const PIXKYCForm_FIELDS = [
  { id: 'phone', label: 'Phone Number', type: 'text', placeholder: 'Phone Number' },
  { id: 'address', label: 'Address', type: 'text', placeholder: 'Address' },
  { id: 'fullName', label: 'Full Name', type: 'text', placeholder: 'Full Name' },
  { id: 'cpf', label: 'CPF', type: 'text', placeholder: 'CPF' },
  { id: 'birthdate', label: 'Birthdate', type: 'date', placeholder: '' },
];

export const PIXKYCForm = ({ feeComparisonRef, setIsOfframpSummaryDialogVisible }: PIXKYCFormProps) => {
  const { setOfframpKycStarted, resetOfframpState } = useOfframpActions();
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
        submitOfframp(executionInput, setIsOfframpSummaryDialogVisible);
      })
      .catch((_error) => {
        console.error('Error during swap confirmation:', _error);
        executionInput?.setInitializeFailed();
      })
      .finally(() => {
        setOfframpKycStarted(false);
      });
  }, [executionInput, setOfframpKycStarted, submitOfframp, setIsOfframpSummaryDialogVisible]);

  const onBackClick = useCallback(() => {
    setOfframpKycStarted(false);
    resetOfframpState();
  }, [setOfframpKycStarted, resetOfframpState]);

  const pollKycStatus = useCallback(async (): Promise<KYCResult> => {
    let shouldContinuePolling = true;

    while (shouldContinuePolling) {
      try {
        const statusResult = await fetchKycStatus(kycForm.getValues('cpf'));

        if (statusResult.status === KYCStatus.FAILED) {
          return KYCResult.REJECTED;
        }

        if (statusResult.status === KYCStatus.SUCCESS) {
          return KYCResult.VALIDATED;
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
      } catch (error) {
        console.error('Error polling KYC status:', error);
        shouldContinuePolling = false;
        throw error;
      }
    }

    throw new Error('KYC polling stopped unexpectedly');
  }, [kycForm]);

  const handleKYCSubmit = useCallback(
    async (data: KYCFormData) => {
      setIsVerifying(true);
      setStatusMessage('Estamos verificando seus dados, aguarde');

      try {
        const result = await pollKycStatus();

        if (result === KYCResult.VALIDATED) {
          setStatusMessage('Você foi validado');
          setTimeout(handleKycReady, VALIDATION_SUCCESS_DELAY_MS);
        } else {
          setStatusMessage('Seu kyc foi rejeitado');
          setTimeout(() => {
            setIsVerifying(false);
            onBackClick();
          }, VALIDATION_FAILURE_DELAY_MS);
        }
      } catch (error) {
        console.error('Error during KYC polling:', error);
        setIsVerifying(false);
        onBackClick();
      }
    },
    [pollKycStatus, handleKycReady, onBackClick],
  );

  return (
    <div className="relative">
      <motion.form
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 min-h-[480px] flex flex-col"
        onSubmit={kycForm.handleSubmit(handleKYCSubmit)}
      >
        <motion.h2
          className="mb-2 text-2xl font-bold text-center text-blue-700"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            delay: 0.1,
            type: 'spring',
            stiffness: 300,
            damping: 15,
          }}
        >
          KYC Details
        </motion.h2>
        {PIXKYCForm_FIELDS.map((field, index) => (
          <motion.div
            className="mb-4"
            key={field.id}
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.1,
            }}
          >
            <motion.label
              htmlFor={field.id}
              className="block mb-1"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.1 + 0.1 }}
            >
              {field.label}
            </motion.label>
            <motion.div
              initial={{ x: '50%' }}
              animate={{ x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 + 0.2 }}
            >
              <Input
                register={kycForm.register(field.id as keyof KYCFormData, { required: true })}
                id={field.id}
                type={field.type}
                className="w-full p-2 rounded"
                placeholder={field.placeholder}
              />
            </motion.div>
          </motion.div>
        ))}

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
