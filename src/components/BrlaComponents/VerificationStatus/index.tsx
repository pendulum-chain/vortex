import { Spinner } from '../../Spinner';
import { motion } from 'framer-motion';

export enum KYCStatus {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PENDING = 'PENDING',
}

export enum KYCResult {
  VALIDATED = 'validated',
  REJECTED = 'rejected',
}

interface VerificationStatusProps {
  status: KYCStatus;
  message: string;
}

export const VerificationStatus = ({ status, message }: VerificationStatusProps) => (
  <motion.div
    className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg justify-center items-center shadow-custom md:mx-auto md:w-96 min-h-[480px] flex flex-col"
    initial={{ scale: 0.9, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.3 }}
  >
    {status === KYCStatus.PENDING && <Spinner />}
    {status === KYCStatus.APPROVED && <SuccessIcon />}
    {status === KYCStatus.REJECTED && <ErrorIcon />}
    <motion.p
      className="mt-4 text-lg font-bold"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
    >
      {message}
    </motion.p>
  </motion.div>
);

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
