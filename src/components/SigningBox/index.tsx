import { Progress } from 'react-daisyui';
import { FC, useRef, useState } from 'preact/compat';
import accountBalanceWalletIcon from '../../assets/account-balance-wallet.svg';

import { OfframpSigningPhase } from '../../types/offramp';
import { isNetworkEVM, Networks } from '../../helpers/networks';
import { useNetwork } from '../../contexts/network';
import { Spinner } from '../Spinner';
import { useEffect } from 'react';

type ProgressStep = {
  started: string;
  signed: string;
  finished: string;
  approved: string;
  login: string;
};

type SignatureConfig = {
  maxSignatures: (step: OfframpSigningPhase) => number;
  getSignatureNumber: (step: OfframpSigningPhase) => number;
};

const EVM_PROGRESS_CONFIG: ProgressStep = {
  started: '25',
  approved: '50',
  signed: '75',
  finished: '100',
  login: '15',
};

const NON_EVM_PROGRESS_CONFIG: ProgressStep = {
  started: '33',
  finished: '100',
  signed: '0',
  approved: '0',
  login: '15',
};

const EVM_SIGNATURE_CONFIG: SignatureConfig = {
  maxSignatures: (step: OfframpSigningPhase) => (step === 'login' ? 1 : 2),
  getSignatureNumber: (step: OfframpSigningPhase) => (step === 'started' || step === 'login' ? 1 : 2),
};

const NON_EVM_SIGNATURE_CONFIG: SignatureConfig = {
  maxSignatures: () => 1,
  getSignatureNumber: () => 1,
};

const getProgressConfig = (network: Networks): ProgressStep => {
  return isNetworkEVM(network) ? EVM_PROGRESS_CONFIG : NON_EVM_PROGRESS_CONFIG;
};

const getSignatureConfig = (network: Networks): SignatureConfig => {
  return isNetworkEVM(network) ? EVM_SIGNATURE_CONFIG : NON_EVM_SIGNATURE_CONFIG;
};

interface SigningBoxProps {
  step?: OfframpSigningPhase;
}

const isValidStep = (step: OfframpSigningPhase | undefined, network: Networks): step is OfframpSigningPhase => {
  if (!step) return false;
  if (step === 'finished') return true;
  if (!isNetworkEVM(network) && (step === 'approved' || step === 'signed')) return false;
  return true;
};

export const SigningBox: FC<SigningBoxProps> = ({ step }) => {
  const { selectedNetwork } = useNetwork();
  const [progressValue, setProgressValue] = useState<number>(0);
  const initialMaxSignaturesRef = useRef<number>(0);
  const initialSignatureNumberRef = useRef<number>(0);

  const { maxSignatures, getSignatureNumber } = getSignatureConfig(selectedNetwork);

  useEffect(() => {
    if (step !== 'finished' && isValidStep(step, selectedNetwork)) {
      initialMaxSignaturesRef.current = maxSignatures(step);
      initialSignatureNumberRef.current = getSignatureNumber(step);
    }
  }, [step, selectedNetwork, maxSignatures, getSignatureNumber]);

  useEffect(() => {
    if (step === 'finished') {
      const animateProgress = () => {
        setProgressValue((prev) => {
          if (prev >= 100) return 100;
          return prev + 1;
        });
      };

      const intervalId = setInterval(animateProgress, 5);
      return () => clearInterval(intervalId);
    } else {
      if (!isValidStep(step, selectedNetwork)) return;
      setProgressValue(Number(getProgressConfig(selectedNetwork)[step]));
    }
  }, [step, selectedNetwork]);

  if (!isValidStep(step, selectedNetwork)) return null;
  if (progressValue === 100) return null;

  const signatureNumber = step === 'finished' ? initialSignatureNumberRef.current : Number(getSignatureNumber(step));

  const maxSignaturesDisplay = step === 'finished' ? initialMaxSignaturesRef.current : maxSignatures(step);

  return (
    <section className="z-50 toast toast-end">
      <div className="shadow-2xl">
        <header className="bg-pink-500 rounded-t">
          <h1 className="w-full py-2 text-center text-white">Action Required</h1>
        </header>

        <main className="px-8 bg-white">
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center w-10 h-10 border rounded-full border-primary">
              <img src={accountBalanceWalletIcon} alt="wallet account button" />
            </div>
            <div className="mx-4 my-5 text-xs">
              <p>Please sign the transaction in</p>
              <p>your connected wallet to proceed</p>
            </div>
          </div>

          <div className="w-full pb-2.5">
            <Progress value={progressValue} max="100" className="h-4 bg-white border progress-primary border-primary" />
          </div>
        </main>

        <footer className="flex items-center justify-center bg-[#5E88D5] text-white rounded-b">
          <Spinner />
          <p className="ml-2.5 my-2 text-xs">
            Waiting for signature {signatureNumber}/{maxSignaturesDisplay}
          </p>
        </footer>
      </div>
    </section>
  );
};
