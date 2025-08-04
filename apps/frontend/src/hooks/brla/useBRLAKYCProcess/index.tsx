import { KycFailureReason } from "@packages/shared";
import { useMachine } from "@xstate/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { storageKeys } from "../../../constants/localStorage";
import { useToastMessage } from "../../../helpers/notifications";
import { brlaKycMachine } from "../../../machines/brlaKyc.machine";
import { KycStatus } from "../../../services/signingService";
import { useTaxId } from "../../../stores/ramp/useRampFormStore";
import { useRampActions, useRampKycLevel2Started } from "../../../stores/rampStore";
import { isValidCnpj } from "../../ramp/schema";
import { useDebouncedValue } from "../../useDebouncedValue";
import { KYCFormData } from "../useKYCForm";

export enum KycLevel {
  LEVEL_1 = 1,
  LEVEL_2 = 2
}

const ERROR_DISPLAY_DURATION_MS = 3000;
const SUCCESS_DISPLAY_DURATION_MS = 2000;

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const useStatusMessages = () => {
  const { t } = useTranslation();
  const STATUS_MESSAGES = useMemo(
    () => ({
      ERROR: t("components.brlaExtendedForm.verificationStatus.error"),
      PENDING: t("components.brlaExtendedForm.verificationStatus.pending"),
      REJECTED: t("components.brlaExtendedForm.verificationStatus.rejected"),
      SUCCESS: t("components.brlaExtendedForm.verificationStatus.success")
    }),
    [t]
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
    [t]
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
  }>({ level: KycLevel.LEVEL_1, status: KycStatus.PENDING });

  const [statusMessage, setStatusMessage] = useState<StatusMessageType>(STATUS_MESSAGES.PENDING);
  const [failureMessage, setFailureMessage] = useState<string | undefined>(undefined);

  const updateStatus = useCallback(
    (status: KycStatus, level: KycLevel, message: StatusMessageType, failureReason?: KycFailureReason) => {
      if (!isSubmitted) return;
      setVerificationStatus(prev => {
        if (prev.status === status && prev.level === level) {
          return prev;
        }
        return { level, status };
      });
      setStatusMessage(prev => (prev === message ? prev : message));
      const translatedFailureMsg = getTranslatedFailureReason(failureReason);
      setFailureMessage(translatedFailureMsg);
    },
    [isSubmitted, getTranslatedFailureReason]
  );

  const resetToDefault = useCallback(() => {
    setVerificationStatus(prev =>
      prev.status === KycStatus.PENDING && prev.level === KycLevel.LEVEL_1
        ? prev
        : { level: KycLevel.LEVEL_1, status: KycStatus.PENDING }
    );
    setStatusMessage(prev => (prev === STATUS_MESSAGES.PENDING ? prev : STATUS_MESSAGES.PENDING));
  }, [STATUS_MESSAGES.PENDING]);

  return {
    failureMessage,
    resetToDefault,
    statusMessage,
    updateStatus,
    verificationStatus
  };
};

export function useKYCProcess() {
  const { STATUS_MESSAGES } = useStatusMessages();
  const { showToast, ToastMessage } = useToastMessage();
  const taxId = useTaxId() || localStorage.getItem(storageKeys.BRLA_KYC_TAX_ID);

  const [state, send] = useMachine(brlaKycMachine, {
    input: {
      taxId
    }
  });

  const { context: machineContext } = state;

  const isSubmitted = !state.matches("Level1") && !state.matches("Started");
  const isSubmittedDebounced = useDebouncedValue(isSubmitted, 3000);

  const { verificationStatus, statusMessage, failureMessage, updateStatus, resetToDefault } =
    useVerificationStatusUI(isSubmittedDebounced);
  const { setRampKycStarted, resetRampState, setRampKycLevel2Started, setRampSummaryVisible, setCanRegisterRamp } =
    useRampActions();
  const offrampKycLevel2Started = useRampKycLevel2Started();

  const desiredLevel = offrampKycLevel2Started ? KycLevel.LEVEL_2 : KycLevel.LEVEL_1;

  const handleBackClick = useCallback(() => {
    setRampKycLevel2Started(false);
    setRampKycStarted(false);
    resetRampState();
    localStorage.removeItem(storageKeys.BRLA_KYC_TAX_ID);
    localStorage.removeItem(storageKeys.BRLA_KYC_PIX_KEY);
  }, [setRampKycLevel2Started, setRampKycStarted, resetRampState]);

  const proceedWithRamp = useCallback(() => {
    setRampKycStarted(false);
    setRampKycLevel2Started(false);
    setCanRegisterRamp(true);
    setRampSummaryVisible(true);
    localStorage.removeItem(storageKeys.BRLA_KYC_TAX_ID);
    localStorage.removeItem(storageKeys.BRLA_KYC_PIX_KEY);
  }, [setRampKycStarted, setRampKycLevel2Started, setCanRegisterRamp, setRampSummaryVisible]);

  const proceedWithKYCLevel2 = useCallback(() => {
    setRampKycLevel2Started(true);
    setRampKycStarted(false);
  }, [setRampKycLevel2Started, setRampKycStarted]);

  const handleFormSubmit = useCallback(
    (formData: KYCFormData) => {
      send({ formData, type: "SubmitLevel1" });
    },
    [send]
  );

  useEffect(() => {
    if (state.matches("Success")) {
      updateStatus(KycStatus.APPROVED, desiredLevel, STATUS_MESSAGES.SUCCESS);
      delay(SUCCESS_DISPLAY_DURATION_MS).then(() => {
        if (isValidCnpj(taxId || "")) {
          updateStatus(KycStatus.PENDING, KycLevel.LEVEL_2, STATUS_MESSAGES.PENDING);
          return proceedWithKYCLevel2();
        }
        proceedWithRamp();
      });
    } else if (state.matches("Failure")) {
      updateStatus(KycStatus.REJECTED, desiredLevel, STATUS_MESSAGES.ERROR, machineContext.failureReason);
      showToast(ToastMessage.KYC_VERIFICATION_FAILED, machineContext.error);
    } else if (state.matches("RejectedLevel1")) {
      updateStatus(KycStatus.REJECTED, KycLevel.LEVEL_1, STATUS_MESSAGES.REJECTED, machineContext.failureReason);
    } else if (state.matches("RejectedLevel2")) {
      updateStatus(KycStatus.REJECTED, KycLevel.LEVEL_2, STATUS_MESSAGES.REJECTED, machineContext.failureReason);
    } else if (state.matches("VerifyingLevel1") || state.matches("VerifyingLevel2")) {
      updateStatus(KycStatus.PENDING, desiredLevel, STATUS_MESSAGES.PENDING);
    }
  }, [
    state,
    updateStatus,
    desiredLevel,
    STATUS_MESSAGES,
    machineContext.failureReason,
    machineContext.error,
    showToast,
    ToastMessage.KYC_VERIFICATION_FAILED,
    proceedWithKYCLevel2,
    proceedWithRamp,
    taxId
  ]);

  return {
    cpfApiError: machineContext.error,
    failureMessage,
    handleBackClick,
    handleFormSubmit,
    isSubmitted,
    kycVerificationError: state.matches("Failure"),
    proceedWithRamp,
    resetToDefault,
    setCpf: () => {},
    setIsSubmitted: () => {},
    statusMessage,
    verificationStatus
  };
}
