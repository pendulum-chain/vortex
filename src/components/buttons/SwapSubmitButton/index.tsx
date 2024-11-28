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

  const { open: openWalletModal } = useAppKit();

  const { isConnected } = useAppKitAccount();

  if (!isConnected) {
    return (
      <div style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}>
        <button onClick={() => openWalletModal()} type="button" className="w-full btn-vortex-primary btn rounded-xl">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}>
      <button className="w-full btn-vortex-primary btn" disabled={showInDisabledState}>
        {pending && <Spinner />}
        {text}
      </button>
    </div>
  );
};
