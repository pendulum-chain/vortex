import { useCallback, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { KYCStatus } from '../VerificationStatus';
import { useSubmitOfframp } from '../../../hooks/offramp/useSubmitOfframp';
import { performSwapInitialChecks } from '../../../pages/swap/helpers/swapConfirm/performSwapInitialChecks';
import { useOfframpActions, useOfframpExecutionInput } from '../../../stores/offrampStore';
import { fetchKycStatus } from '../../../services/signingService';
import { ExtendedBrlaFieldOptions } from '../BrlaField';

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

const POLLING_INTERVAL_MS = 2000;
const ERROR_DISPLAY_DURATION_MS = 3000;
const SUCCESS_DISPLAY_DURATION_MS = 2000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getEnumInitialValues = (enumType: Record<string, string>): Record<string, string> => {
  return Object.values(enumType).reduce((acc, field) => ({ ...acc, [field]: '' }), {} as Record<string, string>);
};

const useKYCForm = () => {
  const kycForm = useForm<Record<ExtendedBrlaFieldOptions, string>>({
    defaultValues: getEnumInitialValues(ExtendedBrlaFieldOptions),
  });

  return { kycForm };
};

const useKYCStatusQuery = (cpf: string | null) => {
  return useQuery<BrlaKycStatus, Error>({
    queryKey: ['kyc-status', cpf],
    queryFn: async () => {
      if (!cpf) throw new Error('CPF is required');
      return fetchKycStatus(cpf);
    },
    enabled: !!cpf,
    refetchInterval: (query) => {
      if (!query.state.data || query.state.data.status === 'PENDING') return POLLING_INTERVAL_MS;
      return false;
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 0,
  });
};

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

const useOfframpSubmission = (
  handleError: (message?: string) => Promise<void>,
  setIsOfframpSummaryDialogVisible: (isVisible: boolean) => void,
) => {
  const { setOfframpKycStarted } = useOfframpActions();
  const offrampInput = useOfframpExecutionInput();
  const submitOfframp = useSubmitOfframp();

  return useCallback(() => {
    if (!offrampInput) {
      return handleError('No execution input found for KYC process');
    }

    performSwapInitialChecks()
      .then(() => {
        console.info('Initial checks completed after KYC. Starting process..');
        submitOfframp(offrampInput, setIsOfframpSummaryDialogVisible);
      })
      .catch((error) => {
        console.error('Error during swap confirmation after KYC', { error });
        offrampInput?.setInitializeFailed();
        handleError('Error during swap confirmation after KYC');
      })
      .finally(() => {
        setOfframpKycStarted(false);
      });
  }, [offrampInput, handleError, submitOfframp, setIsOfframpSummaryDialogVisible, setOfframpKycStarted]);
};

export function useKYCProcess(setIsOfframpSummaryDialogVisible: (isVisible: boolean) => void) {
  const { kycForm } = useKYCForm();
  const { verificationStatus, statusMessage, updateStatus, resetToDefault } = useVerificationStatusUI();

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

      // Invalidate any existing queries for this CPF
      await queryClient.invalidateQueries({ queryKey: ['kyc-status', formData.cpf] });
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
    kycForm,
  };
}
