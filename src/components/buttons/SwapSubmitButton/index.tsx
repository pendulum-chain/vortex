import { useAppKitAccount } from '@reown/appkit/react';
import { useTranslation } from 'react-i18next';

import { usePolkadotWalletState } from '../../../contexts/polkadotWallet';
import { useNetwork } from '../../../contexts/network';

import { isNetworkEVM } from '../../../helpers/networks';
import {
  useOfframpStarted,
  useOfframpState,
  useOfframpInitiating,
  useOfframpSummaryVisible,
} from '../../../stores/offrampStore';
import { useSep24StoreCachedAnchorUrl } from '../../../stores/sep24Store';

import { Spinner } from '../../Spinner';
import { ConnectWalletButton } from '../ConnectWalletButton';

interface SwapSubmitButtonProps {
  disabled: boolean;
}

export const SwapSubmitButton = ({ disabled }: SwapSubmitButtonProps) => {
  const { t } = useTranslation();
  const cachedAnchorUrl = useSep24StoreCachedAnchorUrl();
  const offrampStarted = useOfframpStarted();
  const offrampState = useOfframpState();
  const offrampInitiating = useOfframpInitiating();
  const isOfframpSummaryVisible = useOfframpSummaryVisible();

  const pending =
    offrampInitiating ||
    (offrampStarted && Boolean(cachedAnchorUrl) && isOfframpSummaryVisible) ||
    offrampState !== undefined;

  const text = offrampInitiating
    ? t('components.swapSubmitButton.confirming')
    : offrampStarted && isOfframpSummaryVisible
    ? t('components.swapSubmitButton.processing')
    : t('components.swapSubmitButton.confirm');

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
