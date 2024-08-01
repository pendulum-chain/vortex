import { XMarkIcon } from '@heroicons/react/24/outline';
import { TransactionInfo } from '../../components/TransactionInfo';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';
import { EmailForm } from '../../components/EmailForm';
import { TelegramButton } from '../../components/buttons/TelegramButton';

const Cross = () => (
  <div className="flex items-center justify-center w-20 h-20 border-2 border-red-500 rounded-full">
    <XMarkIcon className="w-10 text-red-500" />
  </div>
);

interface FailurePageProps {
  finishOfframping: () => void;
  transactionId: string | undefined;
}

export const FailurePage = ({ finishOfframping, transactionId }: FailurePageProps) => {
  console.log('Failure page');
  const main = (
    <main>
      <Box className="flex flex-col items-center justify-center mx-auto mt-12">
        <Cross />
        <h1 className="mt-6 text-2xl font-bold text-center text-red-500">Withdrawal unsuccessful</h1>
        {transactionId && <TransactionInfo transactionId={transactionId} />}
        <p className="mt-6 text-center">
          Unfortunately, your withdrawal request could not be processed. Please try again.
        </p>
        <div className="h-0.5 m-auto w-1/5 bg-pink-500 mt-8 mb-5" />
        <p className="text-center text-gray-400">If you continue to experience issues, contact support on:</p>
        <TelegramButton />
        <EmailForm />
        <button className="w-full mt-5 text-white bg-blue-700 btn rounded-xl" onClick={finishOfframping}>
          Try again
        </button>
      </Box>
    </main>
  );

  return <BaseLayout main={main} />;
};
