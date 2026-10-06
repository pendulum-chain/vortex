import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ToastOptions, toast } from "react-toastify";

export enum ToastMessage {
  RAMP_LIMIT_EXCEEDED = "RAMP_LIMIT_EXCEEDED",
  POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION = "POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION",
  ERROR = "ERROR",
  NODE_CONNECTION_ERROR = "NODE_CONNECTION_ERROR",
  SIGNING_REJECTED = "SIGNING_REJECTED",
  COPY_TEXT = "COPY_TEXT"
}

const toastConfig: Record<ToastMessage, { options: ToastOptions; translationKey: string }> = {
  [ToastMessage.COPY_TEXT]: {
    options: {
      toastId: ToastMessage.COPY_TEXT,
      type: "success"
    },
    translationKey: "toasts.copyText"
  },
  [ToastMessage.POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION]: {
    options: {
      toastId: ToastMessage.POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION,
      type: "error"
    },
    translationKey: "toasts.walletAlreadyOpen"
  },
  [ToastMessage.NODE_CONNECTION_ERROR]: {
    options: {
      toastId: ToastMessage.NODE_CONNECTION_ERROR,
      type: "error"
    },
    translationKey: "toasts.nodeConnectionError"
  },
  [ToastMessage.RAMP_LIMIT_EXCEEDED]: {
    options: {
      toastId: ToastMessage.RAMP_LIMIT_EXCEEDED,
      type: "error"
    },
    translationKey: "toasts.rampLimitExceeded"
  },
  [ToastMessage.ERROR]: {
    options: {
      type: "error"
    },
    translationKey: "toasts.genericError"
  },
  [ToastMessage.SIGNING_REJECTED]: {
    options: {
      toastId: ToastMessage.SIGNING_REJECTED,
      type: "warning"
    },
    translationKey: "toasts.signingRejected"
  }
};

export function useToastMessage() {
  const { t } = useTranslation();

  const showToast = useCallback(
    (message: ToastMessage, customMessage?: string) => {
      const options = toastConfig[message].options;

      if (customMessage) {
        return toast(customMessage, options);
      }

      const translatedMessage = t(toastConfig[message].translationKey);
      return toast(translatedMessage, options);
    },
    [t]
  );

  return {
    showToast,
    ToastMessage
  };
}
