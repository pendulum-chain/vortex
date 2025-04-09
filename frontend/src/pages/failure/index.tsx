import { XMarkIcon } from '@heroicons/react/24/outline';
import { TransactionInfo } from '../../components/TransactionInfo';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';
import { EmailForm } from '../../components/EmailForm';
import { config } from '../../config';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useRampExecutionInput } from '../../stores/offrampStore';

const Cross = () => (
  <div className="flex items-center justify-center w-20 h-20 border-2 border-red-500 rounded-full">
    <XMarkIcon className="w-10 text-red-500" />
  </div>
);

export const FailurePage = () => {
  const { finishOfframping } = useRampSubmission();
  const executionInput = useRampExecutionInput();
  const transactionId = executionInput?.quote?.id;

  const main = (
    <main>
      <Box className="flex flex-col items-center justify-center mx-auto mt-12">
        <Cross />
        <h1 className="mt-6 text-2xl font-bold text-center text-red-500">Oops! Something went wrong</h1>
        {transactionId && <TransactionInfo transactionId={transactionId} />}
        <div className="h-0.5 m-auto w-1/5 bg-pink-500 mt-8 mb-5" />
        {transactionId && (
          <p className="text-center text-gray-400">
            In case you experience any issues, please copy this
            <TransactionInfo transactionId={transactionId} />
          </p>
        )}
        <p className="mb-1 mt-5 text-center text-gray-400">
          Contact our{' '}
          <a href={config.supportUrl} target="_blank" rel="noreferrer" className="underline">
            support team
          </a>
          . We're here to help!
        </p>
        <p className="mb-5 text-center text-gray-400">
          Contacted support and ready to start fresh with a new transaction?
          <p className="mt-1">
            Tap
            <button
              className="btn h-8! btn-xs btn-dash rounded-xl inline-flex ml-1 text-gray-400"
              onClick={finishOfframping}
            >
              Reset and Restart
            </button>
          </p>
        </p>
        <EmailForm transactionId={transactionId} transactionSuccess={false} />
      </Box>
    </main>
  );

  return <BaseLayout main={main} />;
};
