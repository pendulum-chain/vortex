import { Progress } from 'react-daisyui';
import { FC, useRef, useState } from 'preact/compat';
import accountBalanceWalletIcon from '../../assets/account-balance-wallet.svg';

import { OfframpSigningPhase } from '../../types/offramp';
import { isNetworkEVM, Networks } from '../../helpers/networks';
import { useNetwork } from '../../contexts/network';
import { Spinner } from '../Spinner';

type ProgressStep = {
  started: string;
  signed: string;
  finished: string;
  approved: string;
  login: string;
};

type SignatureConfig = {
  maxSignatures: number;
  getSignatureNumber: (step: OfframpSigningPhase) => string;
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
  maxSignatures: 2,
  getSignatureNumber: (step: OfframpSigningPhase) => (step === 'started' ? '1' : '2'),
};

const NON_EVM_SIGNATURE_CONFIG: SignatureConfig = {
  maxSignatures: 1,
  getSignatureNumber: () => '1',
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

const increaseProgressValueTo = (from: number, to: number, setProgressValueDisplay: (value: number) => void) => {
  setProgressValueDisplay(from);
  if (from === to) return;

  setTimeout(() => {
    increaseProgressValueTo(from + 1, to, setProgressValueDisplay);
  }, 10);
};

export const SigningBox: FC<SigningBoxProps> = ({ step }) => {
  const { selectedNetwork } = useNetwork();
  const [progressValueDisplay, setProgressValueDisplay] = useState(0);
  const initialMaxSignaturesRef = useRef<number>(0);
  const initialSignatureNumberRef = useRef<number>(0);

  if (!isValidStep(step, selectedNetwork)) return null;

  if (step === 'finished') {
    increaseProgressValueTo(progressValueDisplay, 100, setProgressValueDisplay);
  } else {
    setProgressValueDisplay(Number(getProgressConfig(selectedNetwork)[step]));
  }

  if (progressValueDisplay == 100) {
    return null;
  }

  const { maxSignatures, getSignatureNumber } = getSignatureConfig(selectedNetwork);

  // If it is login step, signatureNumber is 0 and maxSignatures is 1, for any network
  // Finished will display the last signature number and maxSignatures
  const signatureNumber =
    step === 'login' ? 1 : step === 'finished' ? initialMaxSignaturesRef.current : Number(getSignatureNumber(step));
  initialSignatureNumberRef.current = signatureNumber;
  const maxSignaturesDisplay =
    step === 'login' ? 1 : step === 'finished' ? initialMaxSignaturesRef.current : maxSignatures;
  initialMaxSignaturesRef.current = maxSignaturesDisplay;

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
            <Progress
              value={progressValueDisplay}
              max="100"
              className="h-4 bg-white border progress-primary border-primary"
            />
          </div>
        </main>

        <footer className="flex items-center justify-center bg-[#5E88D5] text-white rounded-b">
          <Spinner />
          <p className="ml-2.5 my-2 text-xs">
            Waiting for signature {initialSignatureNumberRef.current}/{initialMaxSignaturesRef.current}
          </p>
        </footer>
      </div>
    </section>
  );
};
