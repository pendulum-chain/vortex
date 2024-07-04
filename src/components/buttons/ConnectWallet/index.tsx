import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export const ConnectWallet = () => (
  <ConnectButton.Custom>
    {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
      // Note: If your app doesn't use authentication, you
      // can remove all 'authenticationStatus' checks
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
                  onClick={openConnectModal}
                  type="button"
                  className="btn rounded-3xl bg-pink-600 text-white border-pink-600"
                >
                  Connect Wallet
                  <PlayCircleIcon className="w-5" />
                </button>
              );
            }

            if (chain.unsupported) {
              return (
                <button
                  onClick={openChainModal}
                  type="button"
                  className="btn rounded-3xl bg-pink-600 text-white border-pink-600"
                >
                  Wrong network
                  <PlayCircleIcon className="w-5" />
                </button>
              );
            }

            return (
              <button
                onClick={openAccountModal}
                type="button"
                className="btn rounded-3xl bg-pink-600 text-white border-pink-600"
              >
                {account.displayName}
                {account.displayBalance ? ` (${account.displayBalance})` : ''}
              </button>
            );
          })()}
        </div>
      );
    }}
  </ConnectButton.Custom>
);
