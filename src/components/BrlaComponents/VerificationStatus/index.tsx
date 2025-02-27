import { Spinner } from '../../Spinner';

export enum KYCStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
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
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-80 z-10">
    {status === KYCStatus.PENDING && <Spinner />}
    {status === KYCStatus.SUCCESS && <SuccessIcon />}
    {status === KYCStatus.FAILED && <ErrorIcon />}
    <p className="mt-4 text-lg font-bold">{message}</p>
  </div>
);

const SuccessIcon = () => (
  <svg className="w-16 h-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ErrorIcon = () => (
  <svg className="w-16 h-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
