import { useState } from 'react';
import { PlayCircleIcon } from '@heroicons/react/20/solid';
import { PolkadotWalletSelectorDialog } from '../../../PolkadotWalletSelectorDialog';
import { useEventsContext } from '../../../../contexts/events';

export const PolkadotConnectWallet = ({ customStyles, hideIcon }: { customStyles?: string; hideIcon?: boolean }) => {
  const [showPolkadotDialog, setShowPolkadotDialog] = useState(false);
  const { handleUserClickWallet } = useEventsContext();

  return (
    <>
      <button
        onClick={() => {
          handleUserClickWallet();
          setShowPolkadotDialog(true);
        }}
        type="button"
        className={`btn rounded-3xl group ${customStyles || 'btn-vortex-secondary'}`}
      >
        <p className="flex">
          Connect <span className="hidden lg:block lg:ml-1">Wallet</span>
        </p>
        {hideIcon ? <></> : <PlayCircleIcon className="w-5 group-hover:text-pink-600" />}
      </button>
      <PolkadotWalletSelectorDialog visible={showPolkadotDialog} onClose={() => setShowPolkadotDialog(false)} />
    </>
  );
};
