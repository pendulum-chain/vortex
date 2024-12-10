import { Progress } from 'react-daisyui';
import { FC } from 'preact/compat';
import accountBalanceWalletIcon from '../../assets/account-balance-wallet.svg';

import { SigningPhase } from '../../hooks/useMainProcess';
import { Spinner } from '../Spinner';
import { Networks, useNetwork } from '../../contexts/network';

interface ProgressConfig {
  started: string;
  signed: string;
  finished: string;
  approved: string;
}

const PROGRESS_CONFIG: Record<Networks, ProgressConfig> = {
  [Networks.AssetHub]: {
    started: '33',
    signed: '66',
    finished: '100',
    approved: '0',
  },
  [Networks.Polygon]: {
    started: '25',
    approved: '50',
    signed: '75',
    finished: '100',
  },
};

const SIGNATURE_CONFIG = {
  [Networks.AssetHub]: {
    maxSignatures: 1,
    getSignatureNumber: () => '1',
  },
  [Networks.Polygon]: {
    maxSignatures: 2,
    getSignatureNumber: (step: SigningPhase) => (step === 'started' ? '1' : '2'),
  },
};

interface SigningBoxProps {
  step?: SigningPhase;
}

export const SigningBox: FC<SigningBoxProps> = ({ step }) => {
  const { selectedNetwork } = useNetwork();

  if (!step) return null;
  if (!['started', 'approved', 'signed'].includes(step)) return null;
  if (selectedNetwork === Networks.AssetHub && step === 'approved') return null;

  const progressValue = PROGRESS_CONFIG[selectedNetwork][step] || '0';
  const { maxSignatures, getSignatureNumber } = SIGNATURE_CONFIG[selectedNetwork];

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
