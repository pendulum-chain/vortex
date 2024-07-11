import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FC } from 'preact/compat';

interface SwapSubmitButtonProps {
  text: string;
}
export const SwapSubmitButton: FC<SwapSubmitButtonProps> = ({ text }) => (
  <ConnectButton.Custom>
    {({ account, chain, openConnectModal, authenticationStatus, mounted }) => {
      const ready = mounted && authenticationStatus !== 'loading';
      const connected =
        ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

      return (
        <div>
          {(() => {
            if (!connected) {
              return (
                <button
                  onClick={openConnectModal}
                  type="button"
                  className="btn rounded-xl bg-blue-700 text-white w-full mt-5"
                >
                  Connect Wallet
                </button>
              );
            }

            return <button className="btn rounded-xl bg-blue-700 text-white w-full mt-5">{text}</button>;
          })()}
        </div>
      );
    }}
  </ConnectButton.Custom>
);
