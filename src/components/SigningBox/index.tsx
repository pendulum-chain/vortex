import { Progress } from 'react-daisyui';
import { FC } from 'preact/compat';
import accountBalanceWalletIcon from '../../assets/account-balance-wallet.svg';

import { SigningPhase } from '../../hooks/offramp/useMainProcess';
import { isNetworkEVM, Networks, useNetwork } from '../../contexts/network';
import { Spinner } from '../Spinner';

type ProgressStep = {
  started: string;
  signed: string;
  finished: string;
  approved: string;
};

type SignatureConfig = {
  maxSignatures: number;
  getSignatureNumber: (step: SigningPhase) => string;
};

const EVM_PROGRESS_CONFIG: ProgressStep = {
  started: '25',
  approved: '50',
  signed: '75',
  finished: '100',
};

const NON_EVM_PROGRESS_CONFIG: ProgressStep = {
  started: '33',
  finished: '100',
  signed: '0',
  approved: '0',
};

const EVM_SIGNATURE_CONFIG: SignatureConfig = {
  maxSignatures: 2,
  getSignatureNumber: (step: SigningPhase) => (step === 'started' ? '1' : '2'),
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
  step?: SigningPhase;
}

const isValidStep = (step: SigningPhase | undefined, network: Networks): step is SigningPhase => {
  if (!step) return false;
  if (!['started', 'approved', 'signed'].includes(step)) return false;
  if (!isNetworkEVM(network) && (step === 'approved' || step === 'signed')) return false;
  return true;
};

export const SigningBox: FC<SigningBoxProps> = ({ step }) => {
  const { selectedNetwork } = useNetwork();

  if (!isValidStep(step, selectedNetwork)) return null;

  const progressValue = getProgressConfig(selectedNetwork)[step];
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
