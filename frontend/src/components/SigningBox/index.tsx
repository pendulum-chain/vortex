import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import { useSafeWalletSignatureStore } from '../../stores/safeWalletSignaturesStore';
import accountBalanceWalletIcon from '../../assets/account-balance-wallet-blue.svg';
import { isNetworkEVM } from 'shared';
import { useNetwork } from '../../contexts/network';
import { Spinner } from '../Spinner';
import { RampSigningPhase } from '../../types/phases';
import { useRampSigningPhase } from '../../stores/offrampStore';
import { useTranslation } from 'react-i18next';

type ProgressConfig = {
  [key in RampSigningPhase]: number;
};

const PROGRESS_CONFIGS: Record<'EVM' | 'NON_EVM', ProgressConfig> = {
  EVM: {
    started: 25,
    approved: 50,
    signed: 75,
    finished: 100,
    login: 15,
  },
  NON_EVM: {
    started: 33,
    finished: 100,
    signed: 0,
    approved: 0,
    login: 15,
  },
};

const getSignatureDetails = (step: RampSigningPhase, isEVM: boolean) => {
  if (!isEVM) return { max: 1, current: 1 };
  if (step === 'login') return { max: 1, current: 1 };
  if (step === 'started') return { max: 2, current: 1 };
  return { max: 2, current: 2 };
};

const isValidStep = (step: RampSigningPhase | undefined, isEVM: boolean): step is RampSigningPhase => {
  if (!step) return false;
  if (step === 'finished' || step === 'login') return true;
  if (!isEVM && (step === 'approved' || step === 'signed')) return false;
  return true;
};

export const SigningBox = () => {
  const { t } = useTranslation();
  const step = useRampSigningPhase();
  const { selectedNetwork } = useNetwork();
  const isEVM = isNetworkEVM(selectedNetwork);
  const progressConfig = isEVM ? PROGRESS_CONFIGS.EVM : PROGRESS_CONFIGS.NON_EVM;
  const { confirmations } = useSafeWalletSignatureStore();

  const [progress, setProgress] = useState(0);
  const [signatureState, setSignatureState] = useState({ max: 0, current: 0 });
  const [shouldExit, setShouldExit] = useState(false);

  useEffect(() => {
    if (!isValidStep(step, isEVM)) return;

    if (step !== 'finished' && shouldExit) {
      setShouldExit(false);
    }

    if (step === 'finished') {
      setProgress(100);
      setTimeout(() => setShouldExit(true), 2500);
      return;
    }

    setProgress(progressConfig[step]);
    setSignatureState(getSignatureDetails(step, isEVM));
  }, [step, isEVM, progressConfig, shouldExit]);

  return (
    <AnimatePresence mode="wait">
      {!isValidStep(step, isEVM) || shouldExit ? null : (
        <motion.section
          className="z-50 toast toast-end"
          initial={{ y: 150 }}
          animate={{ y: 0, transition: { type: 'spring', bounce: 0.4 } }}
          exit={{ y: 150 }}
          transition={{ duration: 0.5 }}
          key="signing-box"
        >
          <div className="shadow-2xl">
            <motion.header className="bg-pink-500 rounded-t">
              <h1 className="w-full py-2 text-center text-white">{t('components.signingBox.actionRequired')}</h1>
            </motion.header>

            <main className="px-8 bg-white">
              <motion.div className="flex items-center justify-center">
                <div className="flex items-center justify-center w-10 h-10 border rounded-full border-primary">
                  <img src={accountBalanceWalletIcon} alt="wallet account button" />
                </div>
                <div className="mx-4 my-5 text-xs">
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

            <motion.footer className="flex items-center justify-center bg-[#5E88D5] text-white rounded-b">
              <Spinner />
              <p className="ml-2.5 my-2 text-xs">
                {t('components.signingBox.waitingForSignature')} {signatureState.current}/{signatureState.max}
                {confirmations.required > 0
                  ? `. (${t('components.signingBox.signatures')} ${confirmations.current}/${confirmations.required})`
                  : ''}
              </p>
            </motion.footer>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
};
