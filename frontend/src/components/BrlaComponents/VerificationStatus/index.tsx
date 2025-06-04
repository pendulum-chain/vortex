import React from 'react';
import { motion } from 'motion/react'; 
import { KycStatus } from '../../../services/signingService'; 
import { Spinner } from '../../Spinner'; 

interface VerificationStatusProps {
  status: { status: KycStatus; level: number };
  message: string;
  failureMessage?: string;
  isLevel2: boolean;
  kycVerificationError?: boolean;
  onContinue: () => void;
  onBackClick: () => void;
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
  onBackClick,
}) => {
  const { status: kycStatus, level } = status;
  const showSuccess = kycStatus === KycStatus.APPROVED && ((level === 1 && !isLevel2) || (level === 2 && isLevel2));

  return (
    <motion.div
      className="px-4 py-4 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 min-h-[480px] flex flex-col items-center justify-center" 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {kycVerificationError ? (
        <>
          <ErrorIcon />
          <motion.p
            className="mt-4 text-lg font-bold text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            Network error, please try again later.
          </motion.p>
          <motion.button
            className="btn-vortex-primary btn mt-6 px-8" 
            onClick={onBackClick}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.3 }}
          >
            Back
          </motion.button>
        </>
      ) : (
        <>
          {kycStatus === KycStatus.PENDING && <Spinner theme="dark" size="lg" />}

          {showSuccess && <SuccessIcon />}

          {kycStatus === KycStatus.REJECTED && <ErrorIcon />}

          <motion.p
            className="mt-4 text-lg font-bold text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {message}
          </motion.p>

          {kycStatus === KycStatus.REJECTED && failureMessage && (
            <motion.p
              className="mt-2 text-sm text-red-600 text-center px-4"
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
              Continue
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
              Try Again
            </motion.button>
          )}
        </>
      )}
    </motion.div>
  );
};

const SuccessIcon = () => (
  <motion.svg
    className="w-16 h-16 text-green-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    transition={{
      type: 'spring',
      stiffness: 200,
      damping: 15,
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
    className="w-16 h-16 text-red-500"
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