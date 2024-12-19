import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { useEventsContext } from '../../../contexts/events';
import accountBalanceWalletIcon from '../../../assets/account-balance-wallet.svg';
import accountBalanceWalletIconPink from '../../../assets/account-balance-wallet-pink.svg';
import { useAppKit, useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react';
import { useMemo } from 'preact/hooks';
import { wagmiConfig } from '../../../wagmiConfig';
import { trimAddress } from '../../../helpers/addressFormatter';
import { useVortexAccount } from '../../../hooks/useVortexAccount';

export function EVMWalletButton({ customStyles, hideIcon }: { customStyles?: string; hideIcon?: boolean }) {
  const { handleUserClickWallet } = useEventsContext();

  // walletChainId is the chainId available on the wallet level
  const { address, chainId: walletChainId } = useVortexAccount();
  const { isConnected } = useAppKitAccount();
  // appkitNetwork contains the chainId currently configured on the app level
  const { caipNetwork: appkitNetwork, switchNetwork } = useAppKitNetwork();
  const { open } = useAppKit();

  // Check if the network selected in the wallet extension is enabled in our wagmi config
  const isOnSupportedNetwork = wagmiConfig.chains.find((chain) => chain.id === walletChainId) !== undefined;

  const ConnectButton = useMemo(() => {
    if (!isConnected) {
      return (
        <button
          onClick={() => {
            handleUserClickWallet();
            open({ view: 'Connect' });
          }}
          type="button"
          className={`${customStyles || 'btn-vortex-secondary'} btn rounded-3xl group`}
        >
          <p className="flex">
            Connect <span className="hidden lg:block lg:ml-1">Wallet</span>
          </p>
          {hideIcon ? <></> : <PlayCircleIcon className="w-5 group-hover:text-pink-600" />}
        </button>
      );
    } else if (!isOnSupportedNetwork) {
      return (
        <button
          onClick={() => {
            if (appkitNetwork) {
              switchNetwork(appkitNetwork);
            }
            handleUserClickWallet();
          }}
          type="button"
          className="btn-vortex-secondary btn rounded-3xl group"
        >
          Wrong network
          {hideIcon ? <></> : <PlayCircleIcon className="w-5 group-hover:text-pink-600" />}
        </button>
      );
    } else {
      return (
        <button
          onClick={() => {
            open({ view: 'Account' });
            handleUserClickWallet();
          }}
          type="button"
          className="btn-vortex-secondary btn rounded-3xl group"
        >
          <img src={accountBalanceWalletIcon} className="block group-hover:hidden" alt="wallet account button" />
          <img
            src={accountBalanceWalletIconPink}
            className="hidden group-hover:block"
            alt="wallet account button hovered"
          />
          <p className="hidden font-thin md:block ">{address ? trimAddress(address) : ''}</p>
        </button>
      );
    }
  }, [
    address,
    appkitNetwork,
    customStyles,
    handleUserClickWallet,
    isConnected,
    isOnSupportedNetwork,
    open,
    switchNetwork,
    hideIcon,
  ]);

  return <>{ConnectButton}</>;
}
