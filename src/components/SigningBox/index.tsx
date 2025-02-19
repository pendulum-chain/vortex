import { FC, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { create } from 'zustand';

import accountBalanceWalletIcon from '../../assets/account-balance-wallet-blue.svg';
import { OfframpSigningPhase } from '../../types/offramp';
import { isNetworkEVM } from '../../helpers/networks';
import { useNetwork } from '../../contexts/network';
import { Spinner } from '../Spinner';

interface SafeWalletSignatureState {
  confirmations: {
    required: number;
    current: number;
  };
  setSigners: (required: number, current: number) => void;
  reset: () => void;
}

/**
 * When using a Safe Wallet, sometimes several signatures are required to confirm a transaction.
 * This store is used to track the number of signatures required and the number of signatures that have been confirmed.
 */

export const useSafeWalletSignatureStore = create<SafeWalletSignatureState>((set) => ({
  confirmations: {
    required: 0,
    current: 0,
  },
  setSigners: (required: number, current: number) => set({ confirmations: { required, current } }),
  reset: () => set({ confirmations: { required: 0, current: 0 } }),
}));

type ProgressConfig = {
  [key in OfframpSigningPhase]: number;
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

const getSignatureDetails = (step: OfframpSigningPhase, isEVM: boolean) => {
  if (!isEVM) return { max: 1, current: 1 };
  if (step === 'login') return { max: 1, current: 1 };
  if (step === 'started') return { max: 2, current: 1 };
  return { max: 2, current: 2 };
};

interface SigningBoxProps {
  step?: OfframpSigningPhase;
}

const isValidStep = (step: OfframpSigningPhase | undefined, isEVM: boolean): step is OfframpSigningPhase => {
  if (!step) return false;
  if (step === 'finished' || step === 'login') return true;
  if (!isEVM && (step === 'approved' || step === 'signed')) return false;
  return true;
};

export const SigningBox: FC<SigningBoxProps> = ({ step }) => {
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
              <h1 className="w-full py-2 text-center text-white">Action Required</h1>
            </motion.header>

            <main className="px-8 bg-white">
              <motion.div className="flex items-center justify-center">
                <div className="flex items-center justify-center w-10 h-10 border rounded-full border-primary">
                  <img src={accountBalanceWalletIcon} alt="wallet account button" />
                </div>
                <div className="mx-4 my-5 text-xs">
                  <p>Please sign the transaction in</p>
                  <p>your connected wallet to proceed</p>
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
                Waiting for signature {signatureState.current}/{signatureState.max}
                {confirmations.required > 0 ? `. (Signers ${confirmations.current}/${confirmations.required})` : ''}
              </p>
            </motion.footer>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
};
