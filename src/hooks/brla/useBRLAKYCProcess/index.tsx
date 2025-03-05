import { useCallback, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { KYCStatus } from '../../../components/BrlaComponents/VerificationStatus';
import { useOfframpActions, useOfframpStore } from '../../../stores/offrampStore';
import { useOfframpSubmission } from '../useOfframpSubmission';
import { useKYCStatusQuery } from '../useKYCStatusQuery';
import { KYCFormData } from '../useKYCForm';
import { createSubaccount } from '../../../services/signingService';
import { useFormStore } from '../../../stores/formStore';

export interface BrlaKycStatus {
  status: string;
}

enum KYCResponseStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  REJECTED = 'REJECTED',
}

const STATUS_MESSAGES = {
  PENDING: 'Estamos verificando seus dados, aguarde',
  SUCCESS: 'Você foi validado',
  REJECTED: 'Seu KYC foi rejeitado',
  ERROR: 'Erro durante a verificação',
};

type StatusMessageType = (typeof STATUS_MESSAGES)[keyof typeof STATUS_MESSAGES];

const ERROR_DISPLAY_DURATION_MS = 3000;
const SUCCESS_DISPLAY_DURATION_MS = 2000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const useVerificationStatusUI = () => {
  const [verificationStatus, setVerificationStatus] = useState<KYCStatus>(KYCStatus.PENDING);
  const [statusMessage, setStatusMessage] = useState<StatusMessageType>(STATUS_MESSAGES.PENDING);

  const updateStatus = useCallback((status: KYCStatus, message: StatusMessageType) => {
    setVerificationStatus(status);
    setStatusMessage(message);
  }, []);

  return {
    verificationStatus,
    statusMessage,
    updateStatus,
    resetToDefault: useCallback(() => {
      setVerificationStatus(KYCStatus.PENDING);
      setStatusMessage(STATUS_MESSAGES.PENDING);
    }, []),
  };
};

export function useKYCProcess(setIsOfframpSummaryDialogVisible: (isVisible: boolean) => void) {
  const { verificationStatus, statusMessage, updateStatus, resetToDefault } = useVerificationStatusUI();
  const { taxId } = useFormStore();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [cpf, setCpf] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: kycResponse, error } = useKYCStatusQuery(cpf);
  const { setOfframpKycStarted, resetOfframpState } = useOfframpActions();

  const handleBackClick = useCallback(() => {
    setOfframpKycStarted(false);
    resetOfframpState();
  }, [setOfframpKycStarted, resetOfframpState]);

  const handleError = useCallback(
    (errorMessage?: string) => {
      console.error(errorMessage || 'KYC process error');
      updateStatus(KYCStatus.REJECTED, STATUS_MESSAGES.ERROR);

      return delay(ERROR_DISPLAY_DURATION_MS).then(() => {
        resetToDefault();
        handleBackClick();
      });
    },
    [handleBackClick, updateStatus, resetToDefault],
  );

  const proceedWithOfframp = useOfframpSubmission(handleError, setIsOfframpSummaryDialogVisible);

  const handleFormSubmit = useCallback(
    async (formData: KYCFormData) => {
      if (!taxId) {
        throw new Error('useKYCProcess: Tax ID must be defined at this point');
      }
      resetToDefault();
      setIsSubmitted(true);

      await queryClient.invalidateQueries({ queryKey: ['kyc-status', taxId] });
      const addressObject = {
        cep: formData.cep,
        city: formData.city,
        street: formData.street,
        number: formData.number,
        district: formData.district,
        state: formData.state,
      };
      createSubaccount({
        ...formData,
        cpf: taxId,
        birthdate: formData.birthdate.toDateString(),
        address: addressObject,
        taxIdType: 'CPF',
      })
        .catch((error) => handleError(error.message))
        .then(() => {
          setCpf(taxId); // Only define cpf after the subaccount creation is successful. Otherwise query will fail.
        });
    },
    [queryClient, resetToDefault],
  );

  useEffect(() => {
    if (!kycResponse) return;

    const handleStatus = async (status: string) => {
      const mappedStatus = status as KYCResponseStatus;

      const statusHandlers: Record<KYCResponseStatus, () => Promise<void>> = {
        [KYCResponseStatus.SUCCESS]: async () => {
          updateStatus(KYCStatus.SUCCESS, STATUS_MESSAGES.SUCCESS);
          await delay(SUCCESS_DISPLAY_DURATION_MS);
          setIsSubmitted(false);
          setOfframpKycStarted(false);
          proceedWithOfframp();
        },
        [KYCResponseStatus.REJECTED]: async () => {
          updateStatus(KYCStatus.REJECTED, STATUS_MESSAGES.REJECTED);
          await delay(ERROR_DISPLAY_DURATION_MS);
          setIsSubmitted(false);
          setOfframpKycStarted(false);
          resetToDefault();
          handleBackClick();
        },
        [KYCResponseStatus.PENDING]: async () => {
          undefined;
        },
      };

      const handler = statusHandlers[mappedStatus];
      if (handler) {
        await handler();
      }
    };

    if (kycResponse.status) {
      handleStatus(kycResponse.status);
    }
  }, [kycResponse, handleBackClick, proceedWithOfframp, updateStatus, resetToDefault]);

  useEffect(() => {
    if (error) {
      handleError(error.message);
    }
  }, [error, handleError]);

  return {
    verificationStatus,
    statusMessage,
    handleFormSubmit,
    handleBackClick,
    isSubmitted,
  };
}
