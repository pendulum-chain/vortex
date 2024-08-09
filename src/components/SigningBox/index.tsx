import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { Progress } from 'react-daisyui';
import { FC } from 'preact/compat';

import { SigningPhase } from '../../hooks/useMainProcess';

const progressValues: Record<SigningPhase, string> = {
  started: '25',
  approved: '50',
  signed: '75',
  finished: '100',
};

function getProgressValue(step: SigningPhase): string {
  return progressValues[step] || '0';
}

function getSignatureNumber(step: SigningPhase): string {
  return step === 'started' ? '1' : '2';
}

interface SigningBoxProps {
  step?: SigningPhase;
}

export const SigningBox: FC<SigningBoxProps> = ({ step }) => {
  if (!step) return <></>;
  if (step !== 'started' && step !== 'approved' && step !== 'signed') return <></>;

  return (
    <section className="toast toast-end">
      <div className="shadow-2xl">
        <header className="bg-pink-500 rounded-t">
          <h1 className="w-full py-2 text-center text-white">Action Required</h1>
        </header>
        <main className="px-8 bg-white">
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center w-10 h-10 border rounded-full border-primary">
              <AccountBalanceWalletOutlinedIcon className="text-primary" />
            </div>
            <div className="mx-4 my-5 text-xs">
              <p>Please sign the transaction in</p>
              <p>your connected wallet to proceed</p>
            </div>
          </div>
          <div className="w-full mb-2.5">
            <Progress
              value={getProgressValue(step)}
              max="100"
              className="h-4 bg-white border progress-primary border-primary"
            />
          </div>
        </main>
        <footer className="flex items-center justify-center bg-[#5E88D5] text-white rounded-b">
          <span className="loading loading-spinner loading-sm"></span>
          <p className="ml-2.5 my-2 text-xs">Waiting for signature {getSignatureNumber(step)}/2</p>
        </footer>
      </div>
    </section>
  );
};
