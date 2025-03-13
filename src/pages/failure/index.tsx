import { XMarkIcon } from '@heroicons/react/24/outline';
import { TransactionInfo } from '../../components/TransactionInfo';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';
import { EmailForm } from '../../components/EmailForm';
import { FailureType } from '../../services/offrampingFlow';
import { config } from '../../config';
import { useTranslation } from 'react-i18next';

const Cross = () => (
  <div className="flex items-center justify-center w-20 h-20 border-2 border-red-500 rounded-full">
    <XMarkIcon className="w-10 text-red-500" />
  </div>
);

interface FailurePageProps {
  finishOfframping: () => void;
  continueFailedFlow: () => void;
  transactionId: string | undefined;
  failure: FailureType;
}

export const FailurePage = ({ finishOfframping, continueFailedFlow, transactionId, failure }: FailurePageProps) => {
  const { t } = useTranslation();
  const main = (
    <main>
      <Box className="flex flex-col items-center justify-center mx-auto mt-12">
        <Cross />
        <h1 className="mt-6 text-2xl font-bold text-center text-red-500">{t('pages.failure.title')}</h1>
        {transactionId && <TransactionInfo transactionId={transactionId} />}
        {failure.type === 'recoverable' ? (
          <>
            <p className="mt-6 text-center">{t('pages.failure.recoverable.description')}</p>
            <p>{t('pages.failure.recoverable.cta')}</p>
          </>
        ) : undefined}
        {failure.type === 'recoverable' && (
          <button className="w-full mt-5 btn-vortex-primary btn rounded-xl" onClick={continueFailedFlow}>
            {t('pages.failure.recoverable.retry')}
          </button>
        )}
        <div className="h-0.5 m-auto w-1/5 bg-pink-500 mt-8 mb-5" />
        {transactionId && (
          <p className="text-center text-gray-400">
            {t('pages.failure.copyTransactionId')}
            <TransactionInfo transactionId={transactionId} />
          </p>
        )}
        <p className="mb-1 mt-5 text-center text-gray-400">
          {t('pages.failure.contactSupport.beforeUrl')}{' '}
          <a href={config.supportUrl} target="_blank" rel="noreferrer" className="underline">
            {t('pages.failure.contactSupport.url')}
          </a>
          {t('pages.failure.contactSupport.afterUrl')}
        </p>
        <p className="mb-5 text-center text-gray-400">
          {t('pages.failure.contactedSupport')}
          <p className="mt-1">
            {t('pages.failure.tapToReset')}
            <button
              className="btn h-8! btn-xs btn-dash rounded-xl inline-flex ml-1 text-gray-400"
              onClick={finishOfframping}
            >
              {t('pages.failure.resetAndRestart')}
            </button>
          </p>
        </p>
        <EmailForm transactionId={transactionId} transactionSuccess={false} />
      </Box>
    </main>
  );

  return <BaseLayout main={main} />;
};
