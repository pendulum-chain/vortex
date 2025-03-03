import { useCallback, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { KYCStatus } from '../../../components/BrlaComponents/VerificationStatus';
import { useOfframpActions } from '../../../stores/offrampStore';
import { ExtendedBrlaFieldOptions } from '../../../components/BrlaComponents/BrlaField';
import { useOfframpSubmission } from '../useOfframpSubmission';
import { useKYCStatusQuery } from '../useKYCStatusQuery';

export interface BrlaKycStatus {
  status: string;
}

enum KYCResponseStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

const STATUS_MESSAGES = {
  PENDING: 'Estamos verificando seus dados, aguarde',
  SUCCESS: 'Você foi validado',
  FAILED: 'Seu KYC foi rejeitado',
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
      updateStatus(KYCStatus.FAILED, STATUS_MESSAGES.ERROR);

      return delay(ERROR_DISPLAY_DURATION_MS).then(() => {
        resetToDefault();
        handleBackClick();
      });
    },
    [handleBackClick, updateStatus, resetToDefault],
  );

  const proceedWithOfframp = useOfframpSubmission(handleError, setIsOfframpSummaryDialogVisible);

  const handleFormSubmit = useCallback(
    async (formData: Record<ExtendedBrlaFieldOptions, string>) => {
      resetToDefault();
      setCpf(formData.cpf);
      setIsSubmitted(true);

      await queryClient.invalidateQueries({ queryKey: ['kyc-status', formData.cpf] });
    },
    [queryClient, resetToDefault],
  );

  useEffect(() => {
    if (!kycResponse) return;

    const handleStatus = async (status: string) => {
      const mappedStatus = status as KYCResponseStatus;
      setIsSubmitted(false);

      const statusHandlers: Record<KYCResponseStatus, () => Promise<void>> = {
        [KYCResponseStatus.SUCCESS]: async () => {
          updateStatus(KYCStatus.SUCCESS, STATUS_MESSAGES.SUCCESS);
          await delay(SUCCESS_DISPLAY_DURATION_MS);
          proceedWithOfframp();
        },
        [KYCResponseStatus.FAILED]: async () => {
          updateStatus(KYCStatus.FAILED, STATUS_MESSAGES.FAILED);
          await delay(ERROR_DISPLAY_DURATION_MS);
          resetToDefault();
          handleBackClick();
        },
        [KYCResponseStatus.PENDING]: async () => undefined,
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
