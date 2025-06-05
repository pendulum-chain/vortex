import { isNetworkEVM } from '@packages/shared';
import { useAppKitAccount } from '@reown/appkit/react';
import { FC } from 'react';
import { useNetwork } from '../../../contexts/network';
import { usePolkadotWalletState } from '../../../contexts/polkadotWallet';
import { Spinner } from '../../Spinner';
import { ConnectWalletButton } from '../ConnectWalletButton';

interface SwapSubmitButtonProps {
  text: string;
  disabled: boolean;
  pending: boolean;
}

export const SwapSubmitButton: FC<SwapSubmitButtonProps> = ({ text, disabled, pending }) => {
  const showInDisabledState = disabled || pending;

  const { walletAccount } = usePolkadotWalletState();
  const { isConnected } = useAppKitAccount();
  const { selectedNetwork } = useNetwork();

  if (!isNetworkEVM(selectedNetwork) && !walletAccount) {
    return (
      <div style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}>
        <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" hideIcon />
      </div>
    );
  }

  if (isNetworkEVM(selectedNetwork) && !isConnected) {
    return (
      <div style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}>
        <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" hideIcon />
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
