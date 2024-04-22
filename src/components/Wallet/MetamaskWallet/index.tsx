import { useCallback, useEffect, useState } from 'preact/compat';
import { Modal } from 'react-daisyui';
import { GlobalState, useGlobalState } from '../../../GlobalStateProvider';
import logo from '../../../assets/metamask-wallet.png';
import {
  ExtensionAccount,
  buildWalletAccount,
  initiateMetamaskInjectedAccount,
} from '../../../services/metamask';
import { Button } from 'react-daisyui';
import { PublicKey } from '../../PublicKey';

export type MetamaskWalletProps = {
  setWalletAccount: GlobalState['setWalletAccount'];
};

const MetamaskWallet = ({ setWalletAccount }: MetamaskWalletProps) => {
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<ExtensionAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<ExtensionAccount>();
  const { tenantName } = useGlobalState();

  const onClick = useCallback(async () => {
    const injectedMetamaskAccount = (await initiateMetamaskInjectedAccount(tenantName)) as ExtensionAccount;
    if (injectedMetamaskAccount) {
      setAccounts([injectedMetamaskAccount]);
      setOpenModal(true);
    } else {
      console.error('Something went wrong, snap not found.');
      setOpenModal(false);
    }
  }, [setOpenModal]);

  useEffect(() => {
    if (selectedAccount) {
      buildWalletAccount(selectedAccount)
        .then((account) => setWalletAccount(account))
        .then(() => {
          setOpenModal(false);
        })
        .catch((error) => console.error(error));
    }
  }, [selectedAccount, setWalletAccount]);

  return (
    <div className="-mt-8">
      <Modal open={openModal} responsive={true}>
        <Button onClick={() => setOpenModal(false)} />
        <h1 className="text-lg mb-2">Metamask Snap Polkadot account: </h1>
        <div>
          {accounts.map((a, i) => (
            <button
              key={i}
              className={`flex items-center gap-4 p-4 rounded-xl text-left w-full bg-[var(--modal-control-background)] hover:bg-[var(--modal-active-background)]`}
              onClick={() => setSelectedAccount(a)}
            >
              <img src={logo} width="32" height="32" alt="Metamask Wallet" />
              <div>
                <div className="text-sm">{a.name}</div>
                <div className="text-xs text-neutral-500">
                  <PublicKey publicKey={a.address} variant="shorter" />{' '}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
      <button
        className={`flex items-center gap-4 p-4 rounded-xl text-left w-full bg-[var(--modal-control-background)] hover:bg-[var(--modal-active-background)]`}
        onClick={onClick}
      >
        <img src={logo} width="32" height="32" alt="Metamask Wallet" />
        Metamask Wallet
      </button>
    </div>
  );
};

export default MetamaskWallet;