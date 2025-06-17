import { motion } from "motion/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { KycStatus } from "../../../services/signingService";
import { Spinner } from "../../Spinner";

interface VerificationStatusProps {
  status: { status: KycStatus; level: number };
  message: string;
  failureMessage?: string;
  isLevel2: boolean;
  kycVerificationError?: boolean;
  onContinue: () => void;
  onBack: () => void;
  onRetry: () => void;
}

export const VerificationStatus: React.FC<VerificationStatusProps> = ({
  status,
  message,
  failureMessage,
  isLevel2,
  kycVerificationError = false,
  onContinue,
  onRetry,
  onBack
}) => {
  const { status: kycStatus, level } = status;
  const showSuccess = kycStatus === KycStatus.APPROVED && ((level === 1 && !isLevel2) || (level === 2 && isLevel2));
  const { t } = useTranslation();

  return (
    <motion.div
      className="mx-4 mt-8 mb-4 flex min-h-[480px] flex-col items-center justify-center rounded-lg px-4 py-4 shadow-custom md:mx-auto md:w-96"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {kycVerificationError ? (
        <>
          <ErrorIcon />
          <motion.p
            className="mt-4 text-center font-bold text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {t(`components.brlaExtendedForm.messageDisplay.networkError`)}
          </motion.p>
          <motion.button
            className="btn-vortex-primary btn mt-6 px-8"
            onClick={onBack}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.3 }}
          >
            {t(`components.brlaExtendedForm.buttons.back`)}
          </motion.button>
        </>
      ) : (
        <>
          {kycStatus === KycStatus.PENDING && <Spinner theme="dark" size="lg" />}

          {showSuccess && <SuccessIcon />}

          {kycStatus === KycStatus.REJECTED && <ErrorIcon />}

          <motion.p
            className="mt-4 text-center font-bold text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {message}
          </motion.p>

          {kycStatus === KycStatus.REJECTED && failureMessage && (
            <motion.p
              className="mt-2 px-4 text-center text-red-600 text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              {failureMessage}
            </motion.p>
          )}

          {showSuccess && (
            <motion.button
              className="btn-vortex-primary btn mt-6 px-8"
              onClick={onContinue}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.3 }}
            >
              {t(`components.brlaExtendedForm.buttons.continue`)}
            </motion.button>
          )}

          {kycStatus === KycStatus.REJECTED && (
            <motion.button
              className="btn-vortex-primary btn mt-6 px-8"
              onClick={onRetry}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.3 }}
            >
              {t(`components.brlaExtendedForm.buttons.tryAgain`)}
            </motion.button>
          )}
        </>
      )}
    </motion.div>
  );
};

const SuccessIcon = () => (
  <motion.svg
    className="h-16 w-16 text-green-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    transition={{
      type: "spring",
      stiffness: 200,
      damping: 15
    }}
  >
    <motion.path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.8, delay: 0.2 }}
    />
  </motion.svg>
);

const ErrorIcon = () => (
  <motion.svg
    className="h-16 w-16 text-red-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    initial={{ rotate: -90, opacity: 0 }}
    animate={{ rotate: 0, opacity: 1 }}
    transition={{ duration: 0.5 }}
  >
    <motion.path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 18L18 6M6 6l12 12"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.6 }}
    />
  </motion.svg>
);
