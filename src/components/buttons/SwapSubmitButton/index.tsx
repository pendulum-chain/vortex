import { FC } from 'preact/compat';
import { Spinner } from '../../Spinner';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';

interface SwapSubmitButtonProps {
  text: string;
  disabled: boolean;
  pending: boolean;
}

export const SwapSubmitButton: FC<SwapSubmitButtonProps> = ({ text, disabled, pending }) => {
  const showInDisabledState = disabled || pending;

  const { open, close } = useAppKit();

  const { address, isConnected, caipAddress, status } = useAppKitAccount();

  return (
    <div>
      {(() => {
        if (!isConnected) {
          return (
            <button onClick={() => open()} type="button" className="w-full mt-5 btn-vortex-primary btn rounded-xl">
              Connect Wallet
            </button>
          );
        }

        return (
          <button className="w-full mt-5 btn-vortex-primary btn" disabled={showInDisabledState}>
            {pending && <Spinner />}
            {text}
          </button>
        );
      })()}
    </div>
  );
};
