import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';

import { KYCStatus, KYCResult } from '../VerificationStatus';
import { useSubmitOfframp } from '../../../hooks/offramp/useSubmitOfframp';
import { performSwapInitialChecks } from '../../../pages/swap/helpers/swapConfirm/performSwapInitialChecks';
import { useOfframpActions, useOfframpExecutionInput } from '../../../stores/offrampStore';
import { fetchKycStatus } from '../../../services/signingService';
import { ExtendedBrlaFieldOptions } from '../BrlaField';

function getEnumInitialValues(enumType: Record<string, string>) {
  return Object.values(enumType).reduce((acc, field) => ({ ...acc, [field]: '' }), {} as Record<string, string>);
}

export function useKYCProcess(setIsOfframpSummaryDialogVisible: (isVisible: boolean) => void) {
  const kycForm = useForm<Record<ExtendedBrlaFieldOptions, string>>({
    defaultValues: getEnumInitialValues(ExtendedBrlaFieldOptions),
  });

  const [verificationStatus, setVerificationStatus] = useState<KYCStatus>(KYCStatus.PENDING);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const { setOfframpKycStarted, resetOfframpState } = useOfframpActions();

  const offrampInput = useOfframpExecutionInput();
  const submitOfframp = useSubmitOfframp();

  const handleBackClick = useCallback(() => {
    setOfframpKycStarted(false);
    resetOfframpState();
  }, [setOfframpKycStarted, resetOfframpState]);

  const proceedWithOfframp = useCallback(() => {
    if (!offrampInput) {
      console.error('No execution input found for KYC process');
      setVerificationStatus(KYCStatus.FAILED);
      setStatusMessage('Error: Missing execution data');
      setTimeout(() => handleBackClick(), 3000);
      return;
    }

    performSwapInitialChecks()
      .then(() => {
        console.info('Initial checks completed after KYC. Starting process..');
        submitOfframp(offrampInput, setIsOfframpSummaryDialogVisible);
      })
      .catch((error) => {
        console.error('Error during swap confirmation after KYC', { error });
        offrampInput?.setInitializeFailed();
        setVerificationStatus(KYCStatus.FAILED);
        setStatusMessage('Error during process initialization');
        setTimeout(() => handleBackClick(), 3000);
      })
      .finally(() => {
        setOfframpKycStarted(false);
      });
  }, [offrampInput, handleBackClick, submitOfframp, setIsOfframpSummaryDialogVisible, setOfframpKycStarted]);

  const checkKycStatusRepeatedly = useCallback(async (cpf: string): Promise<KYCResult> => {
    const POLLING_INTERVAL_MS = 2000; // 2 seconds between polls
    const shouldContinuePolling = true;

    while (shouldContinuePolling) {
      try {
        const response = await fetchKycStatus(cpf);

        if (response.status === 'FAILED') {
          return KYCResult.REJECTED;
        }

        if (response.status === 'SUCCESS') {
          return KYCResult.VALIDATED;
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
      } catch (error) {
        console.warn('Error polling KYC status', { error });
        // Continue polling despite errors
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
      }
    }

    throw new Error('KYC polling stopped unexpectedly');
  }, []);

  const handleFormSubmit = useCallback(
    async (formData: Record<ExtendedBrlaFieldOptions, string>) => {
      setVerificationStatus(KYCStatus.PENDING);
      setStatusMessage('Estamos verificando seus dados, aguarde');

      try {
        const verificationResult = await checkKycStatusRepeatedly(formData.cpf);

        if (verificationResult === KYCResult.VALIDATED) {
          setVerificationStatus(KYCStatus.SUCCESS);
          setStatusMessage('Você foi validado');
          setTimeout(() => {
            proceedWithOfframp();
          }, 2000);
        } else {
          setVerificationStatus(KYCStatus.FAILED);
          setStatusMessage('Seu KYC foi rejeitado');
          setTimeout(() => {
            setVerificationStatus(KYCStatus.PENDING);
            handleBackClick();
          }, 3000);
        }
      } catch (error) {
        console.error('Error during KYC polling', { error });
        setVerificationStatus(KYCStatus.FAILED);
        setStatusMessage('Erro durante a verificação');
        setTimeout(() => {
          setVerificationStatus(KYCStatus.PENDING);
          handleBackClick();
        }, 3000);
      }
    },
    [proceedWithOfframp, handleBackClick, checkKycStatusRepeatedly],
  );

  return {
    verificationStatus,
    statusMessage,
    handleFormSubmit,
    handleBackClick,
    kycForm,
  };
}
