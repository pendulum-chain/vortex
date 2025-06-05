import { useTranslation } from 'react-i18next';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { TransactionInfo } from '../../components/TransactionInfo';
import { Box } from '../../components/Box';
import { EmailForm } from '../../components/EmailForm';
import { config } from '../../config';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useRampState } from '../../stores/rampStore';

const ErrorIcon = () => (
  <div className="flex items-center justify-center w-20 h-20 bg-orange-50 border border-orange-200 rounded-full">
    <ExclamationCircleIcon className="w-10 text-orange-500" />
  </div>
);

export const FailurePage = () => {
  const { t } = useTranslation();
  const { finishOfframping } = useRampSubmission();
  const rampState = useRampState();
  const transactionId = rampState?.ramp?.id || 'N/A';

  return (
    <main>
      <Box className="flex flex-col items-center justify-center mx-auto mt-12 max-w-2xl">
        <ErrorIcon />
        <h1 className="mt-6 text-2xl font-bold text-gray-800 px-4 md:px-8">{t('pages.failure.title')}</h1>

        <div className="mt-6 mb-6 space-y-3 text-gray-600 max-w-lg px-4 md:px-8">
          <p className="leading-relaxed">{t('pages.failure.recoverable.description')}</p>
          <p className="leading-relaxed">{t('pages.failure.recoverable.cta')}</p>
        </div>

        <div className="w-full max-w-md bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Transaction ID:</span>
              <TransactionInfo transactionId={transactionId} />
            </div>

            <div className="flex flex-col space-y-2">
              <a
                href={config.supportUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-center transition-colors"
              >
                {t('pages.failure.contactSupport.url')}
              </a>

              <button
                className="w-full py-2 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-md text-center transition-colors"
                onClick={finishOfframping}
              >
                {t('pages.failure.resetAndRestart')}
              </button>
            </div>
          </div>
        </div>

        <EmailForm transactionId={transactionId} transactionSuccess={false} />
      </Box>
    </main>
  );
};
