import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { useRampActions, useRampKycLevel2Started } from '../../../stores/rampStore';
import { useKycStatusQuery } from '../useKYCStatusQuery';
import { KYCFormData } from '../useKYCForm';
import { createSubaccount, KycStatus } from '../../../services/signingService';
import { useTaxId } from '../../../stores/ramp/useRampFormStore';
import { useToastMessage } from '../../../helpers/notifications';
import { isValidCnpj } from '../../ramp/schema';
import { storageKeys } from '../../../constants/localStorage';
import { useDebouncedValue } from '../../useDebouncedValue';
import { KycFailureReason } from 'shared';

export enum KycLevel {
  LEVEL_1 = 1,
  LEVEL_2 = 2,
}

const ERROR_DISPLAY_DURATION_MS = 3000;
const SUCCESS_DISPLAY_DURATION_MS = 2000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const useStatusMessages = () => {
  const { t } = useTranslation();
  const STATUS_MESSAGES = useMemo(
    () => ({
      PENDING: t('components.brlaExtendedForm.verificationStatus.pending'),
      SUCCESS: t('components.brlaExtendedForm.verificationStatus.success'),
      REJECTED: t('components.brlaExtendedForm.verificationStatus.rejected'),
      ERROR: t('components.brlaExtendedForm.verificationStatus.error'),
    }),
    [t],
  );

  return { STATUS_MESSAGES };
};

const useHumanReadableError = () => {
  const { t } = useTranslation();

  const getTranslatedFailureReason = useCallback(
  (reason?: KycFailureReason): string | undefined => {
    if (!reason) {
      return undefined;
    }
    const translationKey = `components.brlaExtendedForm.kycFailureReasons.${reason}`;
    const translatedMessage = t(translationKey, reason); // Raw key as fallback

    return translatedMessage === translationKey ? reason : translatedMessage; 
  },
  [t],
);

  return { getTranslatedFailureReason };
};


export const useVerificationStatusUI = (isSubmitted: boolean) => {
  const { STATUS_MESSAGES } = useStatusMessages();
  const { getTranslatedFailureReason } = useHumanReadableError();
  type StatusMessageType = (typeof STATUS_MESSAGES)[keyof typeof STATUS_MESSAGES];

  const [verificationStatus, setVerificationStatus] = useState<{
    status: KycStatus;
    level: KycLevel;
  }>({ status: KycStatus.PENDING, level: KycLevel.LEVEL_1 });

  const [statusMessage, setStatusMessage] = useState<StatusMessageType>(STATUS_MESSAGES.PENDING);
  const [failureMessage, setFailureMessage] = useState<string | undefined>(undefined);


  const updateStatus = useCallback((status: KycStatus, level: KycLevel, message: StatusMessageType, failureReason?: KycFailureReason) => {
    if (!isSubmitted) return;
    setVerificationStatus((prev) => {
      if (prev.status === status && prev.level === level) {
        return prev;
      }
      return { status, level };
    });
    setStatusMessage((prev) => (prev === message ? prev : message));
    const translatedFailureMsg = getTranslatedFailureReason(failureReason)
    setFailureMessage(translatedFailureMsg);
  }, [isSubmitted]);

  const resetToDefault = useCallback(() => {
    setVerificationStatus((prev) =>
      prev.status === KycStatus.PENDING && prev.level === KycLevel.LEVEL_1
        ? prev
        : { status: KycStatus.PENDING, level: KycLevel.LEVEL_1 },
    );
    setStatusMessage((prev) => (prev === STATUS_MESSAGES.PENDING ? prev : STATUS_MESSAGES.PENDING));
  }, [STATUS_MESSAGES.PENDING]);

  return {
    verificationStatus,
    statusMessage,
    failureMessage,
    updateStatus,
    resetToDefault,
  };
};

export function useKYCProcess() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [cpf, setCpf] = useState<string | null>(null);
  const [cpfApiError, setCpfApiError] = useState<string | null>(null);
  const [kycVerificationError, setKycVerificationError] = useState<boolean>(false);

  const { STATUS_MESSAGES } = useStatusMessages();
  const { showToast, ToastMessage } = useToastMessage();
  const isSubmittedDebounced = useDebouncedValue(isSubmitted, 3000);
  const { verificationStatus, statusMessage, failureMessage, updateStatus, resetToDefault } = useVerificationStatusUI(isSubmittedDebounced);
  const { setRampKycStarted, resetRampState, setRampKycLevel2Started, setRampSummaryVisible, setCanRegisterRamp } =
    useRampActions();
  const offrampKycLevel2Started = useRampKycLevel2Started();
  const taxId = useTaxId() || localStorage.getItem(storageKeys.BRLA_KYC_TAX_ID);
  const queryClient = useQueryClient();

  const lastErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const desiredLevel = offrampKycLevel2Started ? KycLevel.LEVEL_2 : KycLevel.LEVEL_1;
  const { data: kycResponse, error: fetchStatusError } = useKycStatusQuery(cpf, desiredLevel);

  const handleBackClick = useCallback(() => {
    setRampKycLevel2Started(false);
    setRampKycStarted(false);
    setCpfApiError(null);
    resetRampState();
    localStorage.removeItem(storageKeys.BRLA_KYC_TAX_ID);
  }, [setRampKycLevel2Started, setRampKycStarted, resetRampState]);

  const proceedWithRamp = useCallback(() => {
    setIsSubmitted(false);
    setRampKycStarted(false);
    setRampKycLevel2Started(false);
    setCanRegisterRamp(true);
    setRampSummaryVisible(true);
    localStorage.removeItem(storageKeys.BRLA_KYC_TAX_ID);
  }, [setRampKycStarted, setRampKycLevel2Started, setCanRegisterRamp, setRampSummaryVisible]);

  const proceedWithKYCLevel2 = useCallback(() => {
    setIsSubmitted(false);
    setRampKycLevel2Started(true);
    setRampKycStarted(false);
  }, [setRampKycLevel2Started, setRampKycStarted]);

  const handleError = useCallback(
    (errorMessage?: string) => {
      console.error(errorMessage || 'KYC process error');
      updateStatus(KycStatus.REJECTED, KycLevel.LEVEL_1, STATUS_MESSAGES.ERROR);
      showToast(ToastMessage.KYC_VERIFICATION_FAILED, errorMessage);

      // Treat cpf error as recoverable:
      if (errorMessage?.includes('cpf is invalid') || errorMessage?.includes('cnpj is invalid')) {
        setCpfApiError(errorMessage);
        setIsSubmitted(false); // goes back to the form from the validation component
        return;
      }
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
      setCpfApiError(null);

      const addressObject = {
        cep: formData.cep,
        city: formData.city,
        street: formData.street,
        number: formData.number,
        district: formData.district,
        state: formData.state,
      };

      try {
        if (isValidCnpj(taxId)) {
          // Field is validated in the form. Should not be null when submitting.
          if (!formData.partnerCpf) {
            throw new Error('useKYCProcess: Partner CPF must be defined at this point');
          }

          await createSubaccount({
            ...formData,
            cpf: formData.partnerCpf,
            cnpj: taxId,
            address: addressObject,
            taxIdType: 'CNPJ',
            birthdate: formData.birthdate.getTime(),
            startDate: formData.startDate?.getTime(),
          });
        } else {
          await createSubaccount({
            ...formData,
            cpf: taxId,
            birthdate: formData.birthdate.getTime(),
            address: addressObject,
            taxIdType: 'CPF',
            startDate: formData.startDate?.getTime(),
          });
        }

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
    if (kycResponse.level !== KycLevel.LEVEL_1) return;
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
          if (isValidCnpj(taxId)) {
            updateStatus(KycStatus.PENDING, KycLevel.LEVEL_2, STATUS_MESSAGES.PENDING);
            return proceedWithKYCLevel2();
          }
        },
        [KycStatus.REJECTED]: async () => {
          updateStatus(KycStatus.REJECTED, KycLevel.LEVEL_1, STATUS_MESSAGES.REJECTED, kycResponse.failureReason);
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
    taxId,
    handleBackClick,
    updateStatus,
    resetToDefault,
    setRampKycStarted,
    proceedWithKYCLevel2,
    proceedWithRamp,
    STATUS_MESSAGES.SUCCESS,
    STATUS_MESSAGES.REJECTED,
    offrampKycLevel2Started,
    STATUS_MESSAGES.PENDING,
  ]);

  // Handler for KYC level 2
  useEffect(() => {
    if (!kycResponse) return;
    if (kycResponse.level !== 2) return;
    console.log('KYC level 2 response:', kycResponse);
    const handleStatus = async (status: string) => {
      const mappedStatus = status as KycStatus;

      const statusHandlers: Record<KycStatus, () => Promise<void>> = {
        [KycStatus.APPROVED]: async () => {
          updateStatus(KycStatus.APPROVED, KycLevel.LEVEL_2, STATUS_MESSAGES.SUCCESS);
        },
        [KycStatus.REJECTED]: async () => {
          updateStatus(KycStatus.REJECTED, KycLevel.LEVEL_2, STATUS_MESSAGES.REJECTED, kycResponse.failureReason);
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
    proceedWithRamp,
    setRampKycLevel2Started,
    STATUS_MESSAGES.SUCCESS,
    STATUS_MESSAGES.REJECTED,
  ]);

  useEffect(() => {
    const threshold = 60000;
    if (fetchStatusError) {
      if (!lastErrorTimerRef.current) {
        lastErrorTimerRef.current = setTimeout(() => {
          setKycVerificationError(true);
          lastErrorTimerRef.current = null;
        }, threshold);
        
      }
    } else if (lastErrorTimerRef.current) {
      clearTimeout(lastErrorTimerRef.current);
      lastErrorTimerRef.current = null;
    }

  }, [fetchStatusError, setKycVerificationError]);


  return {
    verificationStatus,
    statusMessage,
    failureMessage,
    kycVerificationError,
    cpfApiError,
    handleFormSubmit,
    handleBackClick,
    setCpf,
    setIsSubmitted,
    isSubmitted,
    proceedWithRamp,
    resetToDefault,
  };
}
