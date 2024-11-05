import { ToastOptions, toast } from 'react-toastify';

export enum ToastMessage {
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  KYC_COMPLETED = 'KYC_COMPLETED',
  SIGNING_FAILED = 'SIGNING_FAILED',
}

type ToastSettings = {
  message: string;
  options: ToastOptions;
};

const ToastProperties: Record<ToastMessage, ToastSettings> = {
  [ToastMessage.AMOUNT_MISMATCH]: {
    message: 'Mismatching offramp amounts detected. Please restart the offramp process.',
    options: {
      toastId: ToastMessage.AMOUNT_MISMATCH,
      type: 'error',
    },
  },
  [ToastMessage.KYC_COMPLETED]: {
    message: 'Success! Get ready to off-ramp.',
    options: {
      toastId: ToastMessage.KYC_COMPLETED,
      type: 'success',
    },
  },
  [ToastMessage.SIGNING_FAILED]: {
    message: 'Signing failed. Please try again.',
    options: {
      toastId: ToastMessage.SIGNING_FAILED,
      type: 'error',
    },
  },
};

export function showToast(message: ToastMessage, customMessage?: string) {
  if (customMessage) {
    return toast(customMessage, ToastProperties[message].options);
  }

  return toast(ToastProperties[message].message, ToastProperties[message].options);
}

export type ShowToast = typeof showToast;
