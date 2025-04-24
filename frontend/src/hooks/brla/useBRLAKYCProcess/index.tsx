import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { useRampActions } from '../../../stores/rampStore';
import { useKycStatusQuery } from '../useKYCStatusQuery';
import { KYCFormData } from '../useKYCForm';
import { createSubaccount, KycStatus } from '../../../services/signingService';
import { useTaxId } from '../../../stores/ramp/useRampFormStore';
import { useToastMessage } from '../../../helpers/notifications';

export interface BrlaKycStatus {
  status: string;
  level: number;
  type: string;
}

const ERROR_DISPLAY_DURATION_MS = 3000;
const SUCCESS_DISPLAY_DURATION_MS = 2000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const useStatusMessages = () => {
  const { t } = useTranslation();

  const STATUS_MESSAGES = {
    PENDING: t('components.brlaExtendedForm.verificationStatus.pending'),
    SUCCESS: t('components.brlaExtendedForm.verificationStatus.success'),
    REJECTED: t('components.brlaExtendedForm.verificationStatus.rejected'),
    ERROR: t('components.brlaExtendedForm.verificationStatus.error'),
  };

  return {
    STATUS_MESSAGES,
  };
};

export const useVerificationStatusUI = () => {
  const { STATUS_MESSAGES } = useStatusMessages();
  type StatusMessageType = (typeof STATUS_MESSAGES)[keyof typeof STATUS_MESSAGES];

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
    }, [STATUS_MESSAGES.PENDING]),
  };
};

export function useKYCProcess() {
  const { STATUS_MESSAGES } = useStatusMessages();
  const { showToast, ToastMessage } = useToastMessage();
  const { verificationStatus, statusMessage, updateStatus, resetToDefault } = useVerificationStatusUI();
  const { setRampSummaryVisible } = useRampActions();
  const taxId = useTaxId();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [cpf, setCpf] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: kycResponse, error } = useKycStatusQuery(cpf);
  const { setRampKycStarted, resetRampState } = useRampActions();

  const handleBackClick = useCallback(() => {
    setRampKycStarted(false);
    resetRampState();
  }, [setRampKycStarted, resetRampState]);

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
    [
      updateStatus,
      STATUS_MESSAGES.ERROR,
      showToast,
      ToastMessage.KYC_VERIFICATION_FAILED,
      resetToDefault,
      handleBackClick,
    ],
  );

  const proceedWithRamp = useCallback(() => {
    setRampKycStarted(false);
    setRampSummaryVisible(true);
  }, [setRampSummaryVisible, setRampKycStarted]);

  const handleFormSubmit = useCallback(
    async (formData: KYCFormData) => {
      if (!taxId) {
        throw new Error('useKYCProcess: CPF must be defined at this point');
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
        console.log('Calling createSubaccount');
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
    if (!kycResponse) return;

    const handleStatus = async (status: string) => {
      const mappedStatus = status as KycStatus;

      const statusHandlers: Record<KycStatus, () => Promise<void>> = {
        [KycStatus.APPROVED]: async () => {
          updateStatus(KycStatus.APPROVED, STATUS_MESSAGES.SUCCESS);
          await delay(SUCCESS_DISPLAY_DURATION_MS);
          setIsSubmitted(false);
          setRampKycStarted(false);
          proceedWithRamp();
        },
        [KycStatus.REJECTED]: async () => {
          updateStatus(KycStatus.REJECTED, STATUS_MESSAGES.REJECTED);
          await delay(ERROR_DISPLAY_DURATION_MS);
          setIsSubmitted(false);
          setRampKycStarted(false);
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
  }, [
    kycResponse,
    handleBackClick,
    proceedWithRamp,
    updateStatus,
    resetToDefault,
    setRampKycStarted,
    STATUS_MESSAGES.SUCCESS,
    STATUS_MESSAGES.REJECTED,
  ]);

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
