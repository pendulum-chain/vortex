import React from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

import { KycStatus } from '../../../services/signingService';
import { Spinner } from '../../Spinner';
import { useRampKycLevel2Started } from '../../../stores/rampStore';

interface VerificationStatusProps {
  status: KycStatus;
  message: string;
  onProceedRamp?: () => void;
  onProceedLevel2?: () => void;
}

export const VerificationStatus: React.FC<VerificationStatusProps> = ({
  status,
  message,
  onProceedRamp,
  onProceedLevel2,
}) => {
  const { t } = useTranslation();
  const offrampKycLevel2Started = useRampKycLevel2Started();

  // TODO need to adjust the APPROVED icon to render conditional also to level and kind of offramp
  return (
    <motion.div
      className="px-4 py-4 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 min-h-[480px] flex flex-col items-center"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >

      
      {status === KycStatus.PENDING && <Spinner theme="dark" size="lg" />}
      {status === KycStatus.APPROVED && <SuccessIcon />}
      {status === KycStatus.REJECTED && <ErrorIcon />}

      <motion.p
        className="mt-4 text-lg font-bold text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        {message}
      </motion.p>

      {status === KycStatus.APPROVED && !offrampKycLevel2Started && (onProceedRamp || onProceedLevel2) && (
        <div className="mt-auto w-full px-4 pb-4 flex gap-3">
          {onProceedRamp && (
            <button
              type="button"
              className="btn-vortex-primary btn flex-1 max-w-[50%] px-4 py-2"
              onClick={onProceedRamp}
            >
              {t('components.brlaKYCForm.buttons.proceedRamp')}
            </button>
          )}
          {onProceedLevel2 && (
            <button
              type="button"
              className="btn-vortex-secondary btn flex-1 max-w-[50%] px-4 py-2"
              onClick={onProceedLevel2}
            >
              {t('components.brlaKYCForm.buttons.proceedKYCLevel2')}
            </button>
          )}
        </div>
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
