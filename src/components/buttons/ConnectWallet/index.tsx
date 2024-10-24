import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useEventsContext } from '../../../contexts/events';
import accountBalanceWalletIcon from '../../../assets/account-balance-wallet.svg';
import accountBalanceWalletIconPink from '../../../assets/account-balance-wallet-pink.svg';

export function ConnectWallet() {
  const { handleUserClickWallet } = useEventsContext();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={() => {
                      openConnectModal();
                      handleUserClickWallet();
                    }}
                    type="button"
                    className="btn-vortex-secondary btn rounded-3xl group"
                  >
                    <p className="flex">
                      Connect <span className="hidden lg:block lg:ml-1">Wallet</span>
                    </p>
                    <PlayCircleIcon className="w-5 group-hover:text-pink-600" />
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={() => {
                      openChainModal();
                      handleUserClickWallet();
                    }}
                    type="button"
                    className="btn-vortex-secondary btn rounded-3xl group"
                  >
                    Wrong network
                    <PlayCircleIcon className="w-5 group-hover:text-pink-600" />
                  </button>
                );
              }

              return (
                <>
                  <button
                    onClick={() => {
                      openAccountModal();
                      handleUserClickWallet();
                    }}
                    type="button"
                    className="btn-vortex-secondary btn rounded-3xl group"
                  >
                    <img
                      src={accountBalanceWalletIcon}
                      className="block group-hover:hidden"
                      alt="wallet account button"
                    />
                    <img
                      src={accountBalanceWalletIconPink}
                      className="hidden group-hover:block"
                      alt="wallet account button hovered"
                    />
                    <p className="hidden font-thin md:block ">{account.displayName}</p>
                  </button>
                </>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
