import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { useRampActions, useRampKycLevel2Started, useRampKycStarted } from '../../../stores/rampStore';
import { useKycStatusQuery } from '../useKYCStatusQuery';
import { KYCFormData } from '../useKYCForm';
import { createSubaccount, KycStatus } from '../../../services/signingService';
import { useTaxId } from '../../../stores/ramp/useRampFormStore';
import { useToastMessage } from '../../../helpers/notifications';
import { isValidCnpj } from '../../ramp/schema';

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

  const [verificationStatus, setVerificationStatus] = useState<{status: KycStatus, level: number}>({status: KycStatus.PENDING, level: 1});
  const [statusMessage, setStatusMessage] = useState<StatusMessageType>(STATUS_MESSAGES.PENDING);

  const updateStatus = useCallback((status: KycStatus, level: number, message: StatusMessageType) => {
    setVerificationStatus({status, level});
    setStatusMessage(message);
  }, []);

  return {
    verificationStatus,
    statusMessage,
    updateStatus,
    resetToDefault: useCallback(() => {
      setVerificationStatus({status: KycStatus.PENDING, level: 1});
      setStatusMessage(STATUS_MESSAGES.PENDING);
    }, [STATUS_MESSAGES.PENDING]),
  };
};

export function useKYCProcess() {
  const { STATUS_MESSAGES } = useStatusMessages();
  const { showToast, ToastMessage } = useToastMessage();
  const { verificationStatus, statusMessage, updateStatus, resetToDefault } = useVerificationStatusUI();
  const taxId = useTaxId();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [cpf, setCpf] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // TODO why does this stop after the first ACCEPTED (kyc level 1) response?
  const { data: kycResponse, error } = useKycStatusQuery(cpf);
  const { setRampKycStarted, resetRampState, setRampKycLevel2Started, setRampSummaryVisible } = useRampActions();
  const offrampKycLevel2Started = useRampKycLevel2Started();

  const handleBackClick = useCallback(() => {
    console.log('Back button clicked');
    setRampKycLevel2Started(false);
    setRampKycStarted(false);
    resetRampState();
  }, [setRampKycStarted, resetRampState]);

  const proceedWithRamp = useCallback(() => {
    setIsSubmitted(false);
    setRampKycStarted(false);
    setRampKycLevel2Started(false);
    setRampSummaryVisible(true);
  }, [setRampSummaryVisible, setRampKycStarted]);

  const proceedWithKYCLevel2 = useCallback(() => {
    setIsSubmitted(false);
    setRampKycLevel2Started(true);
    setRampKycStarted(false);
  }, [setRampKycLevel2Started, setRampKycStarted]);

  const handleError = useCallback(
    (errorMessage?: string) => {
      console.error(errorMessage || 'KYC process error');
      updateStatus(KycStatus.REJECTED, 1, STATUS_MESSAGES.ERROR);
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

  // Handler for KYC level 1
  useEffect(() => {
    if (!kycResponse) return;
    if (kycResponse.level !== 1) return;
    if (offrampKycLevel2Started) return; // Ignore this effect if level 2 is already started.

    if (!taxId) {
      throw new Error('useKYCProcess: CPF must be defined at this point');
    }

    const handleStatus = async (status: string) => {
      const mappedStatus = status as KycStatus;

      const statusHandlers: Record<KycStatus, () => Promise<void>> = {
        [KycStatus.APPROVED]: async () => {
          updateStatus(KycStatus.APPROVED, 1, STATUS_MESSAGES.SUCCESS);
          await delay(SUCCESS_DISPLAY_DURATION_MS);

          // Only if this is a CNPJ type user, do we move to level 2.
          if (!isValidCnpj(taxId)){
            return proceedWithKYCLevel2();
          }
          resetToDefault();
          proceedWithRamp();
        },
        [KycStatus.REJECTED]: async () => {
          updateStatus(KycStatus.REJECTED, 1, STATUS_MESSAGES.REJECTED);
          await delay(ERROR_DISPLAY_DURATION_MS);
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
    updateStatus,
    resetToDefault,
    setRampKycStarted,
    STATUS_MESSAGES.SUCCESS,
    STATUS_MESSAGES.REJECTED,
  ]);

  // Handler for KYC level 2
  useEffect(() => {
      console.log('KYC Response form doc upload:', kycResponse);
      if (!kycResponse) return;
      if (kycResponse.level !== 2) return;
  
      const handleStatus = async (status: string) => {
        const mappedStatus = status as KycStatus;
  
        const statusHandlers: Record<KycStatus, () => Promise<void>> = {
          [KycStatus.APPROVED]: async () => {
            updateStatus(KycStatus.APPROVED, 2, STATUS_MESSAGES.SUCCESS);
            await delay(3000);
            proceedWithRamp();
          },
          [KycStatus.REJECTED]: async () => {
            updateStatus(KycStatus.REJECTED, 2, STATUS_MESSAGES.REJECTED);
            await delay(3000);
            setRampKycLevel2Started(false);
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
      updateStatus,
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
    setIsSubmitted,
    isSubmitted,
  };
}
