import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useOfframpActions } from '../../../stores/offrampStore';
import { useOfframpSubmission } from '../useOfframpSubmission';
import { useKycStatusQuery } from '../useKYCStatusQuery';
import { KYCFormData } from '../useKYCForm';
import { createSubaccount, KycStatus } from '../../../services/signingService';
import { useFormStore } from '../../../stores/formStore';
import { showToast, ToastMessage } from '../../../helpers/notifications';

export interface BrlaKycStatus {
  status: string;
}

const STATUS_MESSAGES = {
  PENDING: 'Verifying your data, please wait',
  SUCCESS: 'Verification successful',
  REJECTED: 'KYC verification rejected',
  ERROR: 'Verification error',
};

type StatusMessageType = (typeof STATUS_MESSAGES)[keyof typeof STATUS_MESSAGES];

const ERROR_DISPLAY_DURATION_MS = 3000;
const SUCCESS_DISPLAY_DURATION_MS = 2000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const useVerificationStatusUI = () => {
  const [verificationStatus, setVerificationStatus] = useState<KycStatus>(KycStatus.PENDING);
  const [statusMessage, setStatusMessage] = useState<StatusMessageType>(STATUS_MESSAGES.PENDING);

  const updateStatus = useCallback((status: KycStatus, message: StatusMessageType) => {
    setVerificationStatus(status);
    setStatusMessage(message);
  }, []);

  return {
    verificationStatus,
    statusMessage,
    updateStatus,
    resetToDefault: useCallback(() => {
      setVerificationStatus(KycStatus.PENDING);
      setStatusMessage(STATUS_MESSAGES.PENDING);
    }, []),
  };
};

export function useKYCProcess() {
  const { verificationStatus, statusMessage, updateStatus, resetToDefault } = useVerificationStatusUI();
  const { taxId } = useFormStore();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [cpf, setCpf] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: kycResponse, error } = useKycStatusQuery(cpf);
  const { setOfframpKycStarted, resetOfframpState } = useOfframpActions();

  const handleBackClick = useCallback(() => {
    setOfframpKycStarted(false);
    resetOfframpState();
  }, [setOfframpKycStarted, resetOfframpState]);

  const handleError = useCallback(
    (errorMessage?: string) => {
      console.error(errorMessage || 'KYC process error');
      updateStatus(KycStatus.REJECTED, STATUS_MESSAGES.ERROR);
      showToast(ToastMessage.KYC_VERIFICATION_FAILED, errorMessage);

      return delay(ERROR_DISPLAY_DURATION_MS).then(() => {
        resetToDefault();
        handleBackClick();
      });
    },
    [handleBackClick, updateStatus, resetToDefault],
  );

  const proceedWithOfframp = useOfframpSubmission(handleError);

  const handleFormSubmit = useCallback(
    async (formData: KYCFormData) => {
      if (!taxId) {
        throw new Error('useKYCProcess: Tax ID must be defined at this point');
      }
      resetToDefault();
      setIsSubmitted(true);

      const addressObject = {
        cep: formData.cep,
        city: formData.city,
        street: formData.street,
        number: formData.number,
        district: formData.district,
        state: formData.state,
      };

      try {
        console.log('Calling createSubaccount ');
        await createSubaccount({
          ...formData,
          cpf: taxId,
          birthdate: formData.birthdate.getTime(),
          address: addressObject,
          taxIdType: 'CPF',
        });

        setCpf(taxId);
        await queryClient.invalidateQueries({ queryKey: ['kyc-status', taxId] });
      } catch (error) {
        await handleError(error instanceof Error ? error.message : 'Unknown error');
      }
    },
    [handleError, queryClient, resetToDefault, taxId],
  );

  useEffect(() => {
    console.log('in useEffect kycResponse', kycResponse);
    if (!kycResponse) return;

    const handleStatus = async (status: string) => {
      const mappedStatus = status as KycStatus;

      const statusHandlers: Record<KycStatus, () => Promise<void>> = {
        [KycStatus.APPROVED]: async () => {
          updateStatus(KycStatus.APPROVED, STATUS_MESSAGES.SUCCESS);
          await delay(SUCCESS_DISPLAY_DURATION_MS);
          setIsSubmitted(false);
          setOfframpKycStarted(false);
          proceedWithOfframp();
        },
        [KycStatus.REJECTED]: async () => {
          updateStatus(KycStatus.REJECTED, STATUS_MESSAGES.REJECTED);
          await delay(ERROR_DISPLAY_DURATION_MS);
          setIsSubmitted(false);
          setOfframpKycStarted(false);
          resetToDefault();
          handleBackClick();
        },
        [KycStatus.PENDING]: async () => undefined,
      };

      const handler = statusHandlers[mappedStatus];
      if (handler) {
        await handler();
      }
    };

    if (kycResponse.status) {
      handleStatus(kycResponse.status);
    }
  }, [kycResponse, handleBackClick, proceedWithOfframp, updateStatus, resetToDefault, setOfframpKycStarted]);

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
