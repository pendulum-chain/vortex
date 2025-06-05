import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import accountBalanceWalletIcon from '../../assets/account-balance-wallet-blue.svg';
import { Spinner } from '../Spinner';

interface SigningBoxButtonProps {
  signatureState: { max: number; current: number };
  confirmations: { required: number; current: number };
}

export const SigningBoxButton = ({ signatureState, confirmations }: SigningBoxButtonProps) => {
  const { t } = useTranslation();

  return (
    <button className="btn-vortex-primary btn rounded-xl" disabled style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}>
      <Spinner />
      <p className="ml-2.5 my-2 text-xs">
        {t('components.signingBox.waitingForSignature')} {signatureState.current}/{signatureState.max}
        {confirmations.required > 0
          ? `. (${t('components.signingBox.signatures')} ${confirmations.current}/${confirmations.required})`
          : ''}
      </p>
    </button>
  );
};
interface SigningBoxContentProps {
  progress: number;
  className?: string;
}

export const SigningBoxContent: React.FC<SigningBoxContentProps> = ({ progress, className = '' }) => {
  const { t } = useTranslation();

  return (
    <div className={className}>
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
    </div>
  );
};
