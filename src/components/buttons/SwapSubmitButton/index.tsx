import { FC } from 'preact/compat';
import { Spinner } from '../../Spinner';
import { useAppKitAccount } from '@reown/appkit/react';
import { ConnectWalletButton } from '../ConnectWalletButton';
import { usePolkadotWalletState } from '../../../contexts/polkadotWallet';
import { Networks, useNetwork } from '../../../contexts/network';

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

  if (selectedNetwork === Networks.AssetHub && !walletAccount) {
    return (
      <div className="grow">
        <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" />
      </div>
    );
  }

  if (selectedNetwork === Networks.Polygon && !isConnected) {
    return (
      <div className="grow">
        <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grow">
      <button className="w-full btn-vortex-primary btn" disabled={showInDisabledState}>
        {pending && <Spinner />}
        {text}
      </button>
    </div>
  );
};
