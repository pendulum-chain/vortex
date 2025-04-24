import { useTranslation } from 'react-i18next';
import { ToastOptions, toast } from 'react-toastify';

export enum ToastMessage {
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  RAMP_LIMIT_EXCEEDED = 'RAMP_LIMIT_EXCEEDED',
  KYC_COMPLETED = 'KYC_COMPLETED',
  KYC_VERIFICATION_FAILED = 'KYC_VERIFICATION_FAILED',
  SIGNING_FAILED = 'SIGNING_FAILED',
  POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION = 'POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION',
  ERROR = 'ERROR',
  NODE_CONNECTION_ERROR = 'NODE_CONNECTION_ERROR',
}

const toastConfig: Record<ToastMessage, { options: ToastOptions; translationKey: string }> = {
  [ToastMessage.AMOUNT_MISMATCH]: {
    options: {
      toastId: ToastMessage.AMOUNT_MISMATCH,
      type: 'error',
    },
    translationKey: 'toasts.amountMismatch',
  },
  [ToastMessage.KYC_COMPLETED]: {
    options: {
      toastId: ToastMessage.KYC_COMPLETED,
      type: 'success',
    },
    translationKey: 'toasts.kycCompleted',
  },
  [ToastMessage.KYC_VERIFICATION_FAILED]: {
    options: {
      toastId: ToastMessage.KYC_VERIFICATION_FAILED,
      type: 'error',
    },
    translationKey: 'toasts.kycVerificationFailed',
  },
  [ToastMessage.SIGNING_FAILED]: {
    options: {
      toastId: ToastMessage.SIGNING_FAILED,
      type: 'error',
    },
    translationKey: 'toasts.signingFailed',
  },
  [ToastMessage.POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION]: {
    options: {
      toastId: ToastMessage.POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION,
      type: 'error',
    },
    translationKey: 'toasts.walletAlreadyOpen',
  },
  [ToastMessage.NODE_CONNECTION_ERROR]: {
    options: {
      toastId: ToastMessage.NODE_CONNECTION_ERROR,
      type: 'error',
    },
    translationKey: 'toasts.nodeConnectionError',
  },
  [ToastMessage.RAMP_LIMIT_EXCEEDED]: {
    options: {
      toastId: ToastMessage.RAMP_LIMIT_EXCEEDED,
      type: 'error',
    },
    translationKey: 'toasts.rampLimitExceeded',
  },
  [ToastMessage.ERROR]: {
    options: {
      type: 'error',
    },
    translationKey: 'toasts.genericError',
  },
};

export function useToastMessage() {
  const { t } = useTranslation();

  const getToastOptions = (message: ToastMessage): ToastOptions => {
    return toastConfig[message].options;
  };

  const getToastMessage = (message: ToastMessage): string => {
    return t(toastConfig[message].translationKey);
  };

  const showToast = (message: ToastMessage, customMessage?: string) => {
    const options = getToastOptions(message);

    if (customMessage) {
      return toast(customMessage, options);
    }

    const translatedMessage = getToastMessage(message);
    return toast(translatedMessage, options);
  };

  return {
    ToastMessage,
    showToast,
  };
}

export function showToastRaw(message: ToastMessage, customMessage: string) {
  return toast(customMessage, toastConfig[message].options);
}
