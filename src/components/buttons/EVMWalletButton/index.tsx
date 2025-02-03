import { ReactNode } from 'react';
import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { useAppKit, useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react';

import { useEventsContext } from '../../../contexts/events';
import accountBalanceWalletIcon from '../../../assets/account-balance-wallet.svg';
import accountBalanceWalletIconPink from '../../../assets/account-balance-wallet-pink.svg';
import { wagmiConfig } from '../../../wagmiConfig';
import { trimAddress } from '../../../helpers/addressFormatter';
import { useVortexAccount } from '../../../hooks/useVortexAccount';

const WalletButton = ({
  onClick,
  children,
  customStyles,
  hideIcon = false,
  showPlayIcon = false,
  showWalletIcons = false,
  address,
}: {
  onClick: () => void;
  children?: ReactNode;
  customStyles?: string;
  hideIcon?: boolean;
  showPlayIcon?: boolean;
  showWalletIcons?: boolean;
  address?: string;
}) => (
  <button onClick={onClick} type="button" className={`${customStyles || 'btn-vortex-secondary'} btn rounded-3xl group`}>
    {showWalletIcons ? (
      <>
        <img src={accountBalanceWalletIcon} className="block group-hover:hidden" alt="wallet account button" />
        <img
          src={accountBalanceWalletIconPink}
          className="hidden group-hover:block"
          alt="wallet account button hovered"
        />
        <p className="hidden font-thin md:block ">{address ? trimAddress(address) : ''}</p>
      </>
    ) : (
      <>
        {children}
        {!hideIcon && showPlayIcon && <PlayCircleIcon className="w-5 group-hover:text-pink-600" />}
      </>
    )}
  </button>
);

export function EVMWalletButton({ customStyles, hideIcon }: { customStyles?: string; hideIcon?: boolean }) {
  const { handleUserClickWallet } = useEventsContext();
  const { address, chainId: walletChainId } = useVortexAccount();
  const { isConnected } = useAppKitAccount();
  const { caipNetwork: appkitNetwork, switchNetwork } = useAppKitNetwork();
  const { open } = useAppKit();

  const isOnSupportedNetwork = wagmiConfig.chains.find((chain) => chain.id === walletChainId) !== undefined;

  if (!isConnected) {
    return (
      <WalletButton
        onClick={() => {
          handleUserClickWallet();
          open({ view: 'Connect' });
        }}
        customStyles={customStyles}
        hideIcon={hideIcon}
        showPlayIcon
      >
        <p className="flex">
          Connect <span className="hidden lg:block lg:ml-1">Wallet</span>
        </p>
      </WalletButton>
    );
  }

  if (!isOnSupportedNetwork) {
    return (
      <WalletButton
        onClick={() => {
          if (appkitNetwork) {
            switchNetwork(appkitNetwork);
          }
          handleUserClickWallet();
        }}
        hideIcon={hideIcon}
        showPlayIcon
      >
        Wrong network
      </WalletButton>
    );
  }

  return (
    <WalletButton
      onClick={() => {
        open({ view: 'Account' });
        handleUserClickWallet();
      }}
      showWalletIcons
      address={address}
    />
  );
}
