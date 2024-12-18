import { Progress } from 'react-daisyui';
import { FC } from 'preact/compat';
import accountBalanceWalletIcon from '../../assets/account-balance-wallet.svg';

import { SigningPhase } from '../../hooks/offramp/useMainProcess';
import { isNetworkEVM, Networks, useNetwork } from '../../contexts/network';
import { Spinner } from '../Spinner';

interface ProgressConfig {
  started: string;
  signed: string;
  finished: string;
  approved: string;
}

function getProgressConfig(network: Networks, step: SigningPhase): ProgressConfig {
  if (isNetworkEVM(network)) {
    return {
      started: '25',
      approved: '50',
      signed: '75',
      finished: '100',
    };
  } else {
    return {
      started: '33',
      finished: '100',
      signed: '0',
      approved: '0',
    };
  }
}

function getSignatureConfig(network: Networks): any {
  if (isNetworkEVM(network)) {
    return {
      maxSignatures: 2,
      getSignatureNumber: (step: SigningPhase) => (step === 'started' ? '1' : '2'),
    };
  } else {
    return {
      maxSignatures: 1,
      getSignatureNumber: () => '1',
    };
  }
}

interface SigningBoxProps {
  step?: SigningPhase;
}

export const SigningBox: FC<SigningBoxProps> = ({ step }) => {
  const { selectedNetwork } = useNetwork();

  if (!step) return null;
  if (!['started', 'approved', 'signed'].includes(step)) return null;
  if (!isNetworkEVM(selectedNetwork) && (step === 'approved' || step === 'signed')) return null;

  const progressValue = getProgressConfig(selectedNetwork, step) || '0';
  const { maxSignatures, getSignatureNumber } = getSignatureConfig(selectedNetwork);

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
            Waiting for signature {getSignatureNumber(step)}/{maxSignatures}
          </p>
        </footer>
      </div>
    </section>
  );
};
