import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import accountBalanceWalletIcon from '../../assets/account-balance-wallet-blue.svg';
import { Spinner } from '../Spinner';

interface SigningBoxContentProps {
  progress: number;
  signatureState: { max: number; current: number };
  confirmations: { required: number; current: number };
  className?: string;
  showHeader?: boolean;
  showFooter?: boolean;
}

export const SigningBoxContent: React.FC<SigningBoxContentProps> = ({
  progress,
  signatureState,
  confirmations,
  className = '',
  showHeader = true,
  showFooter = true,
}) => {
  const { t } = useTranslation();

  return (
    <div className={className}>
      {showHeader && (
        <motion.header className="bg-pink-500 rounded-t">
          <h1 className="w-full py-2 text-center text-white">{t('components.signingBox.actionRequired')}</h1>
        </motion.header>
      )}

      <main className="px-8 bg-white">
        <motion.div className="flex items-center justify-center">
          <div className="flex items-center justify-center w-10 h-10 border rounded-full border-primary">
            <img src={accountBalanceWalletIcon} alt="wallet account button" />
          </div>
          <div className="mx-4 my-5 text-xs text-black">
            <p>{t('components.signingBox.pleaseSignTransaction')}</p>
            <p>{t('components.signingBox.yourConnectedWallet')}</p>
          </div>
        </motion.div>

        <motion.div className="w-full pb-2.5">
          <div className="w-full h-4 overflow-hidden bg-white border rounded-full border-primary">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'linear' }}
            />
          </div>
        </motion.div>
      </main>

      {showFooter && (
        <motion.footer className="flex items-center justify-center bg-[#5E88D5] text-white rounded-b">
          <Spinner />
          <p className="ml-2.5 my-2 text-xs">
            {t('components.signingBox.waitingForSignature')} {signatureState.current}/{signatureState.max}
            {confirmations.required > 0
              ? `. (${t('components.signingBox.signatures')} ${confirmations.current}/${confirmations.required})`
              : ''}
          </p>
        </motion.footer>
      )}
    </div>
  );
};
