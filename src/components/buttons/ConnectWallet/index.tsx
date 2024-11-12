import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { useEventsContext } from '../../../contexts/events';
import accountBalanceWalletIcon from '../../../assets/account-balance-wallet.svg';
import accountBalanceWalletIconPink from '../../../assets/account-balance-wallet-pink.svg';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';

export function ConnectWallet() {
  const { handleUserClickWallet } = useEventsContext();

  const { open, close } = useAppKit();

  const { address, isConnected, caipAddress, status } = useAppKitAccount();

  const ready = status === 'connected';

  return (
    <div>
      <appkit-button label="Connect" />
    </div>
  );
}
