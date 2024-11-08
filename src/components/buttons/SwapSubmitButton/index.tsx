import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FC } from 'preact/compat';
import { Spinner } from '../../Spinner';

interface SwapSubmitButtonProps {
  text: string;
  disabled: boolean;
  pending: boolean;
}
export const SwapSubmitButton: FC<SwapSubmitButtonProps> = ({ text, disabled, pending }) => (
  <ConnectButton.Custom>
    {({ account, chain, openConnectModal, authenticationStatus, mounted }) => {
      const ready = mounted && authenticationStatus !== 'loading';
      const connected =
        ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

      const showInDisabledState = disabled || pending;

      return (
        <div>
          {(() => {
            if (!connected) {
              return (
                <button
                  onClick={openConnectModal}
                  type="button"
                  className="w-full mt-5 btn-vortex-primary btn rounded-xl"
                >
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
    }}
  </ConnectButton.Custom>
);
