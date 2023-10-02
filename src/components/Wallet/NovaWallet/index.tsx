import { web3Accounts, web3Enable, web3FromAddress } from '@polkadot/extension-dapp';
import { useCallback, useEffect, useState } from 'preact/compat';
import { Modal } from 'react-daisyui';
import { GlobalState } from '../../../GlobalStateProvider';
import logo from '../../../assets/nova-wallet.png';
import { PublicKey } from '../../PublicKey';

export type NovaWalletProps = {
  setWalletAccount: GlobalState['setWalletAccount'];
};

interface ExtensionAccount {
  address: string;
  name: string;
  source: string;
}

const NovaWallet = ({ setWalletAccount }: NovaWalletProps) => {
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<ExtensionAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<ExtensionAccount>();

  const onClick = useCallback(async () => {
    const allInjected = await web3Enable('Pendulum Chain Portal');
    const allAccounts = await web3Accounts();
    setAccounts(
      allAccounts
        .filter(({ meta: { source } }) => source === 'polkadot-js')
        .map(
          ({ address, meta }): ExtensionAccount => ({
            address: address,
            name: meta.name || 'My Account',
            source: meta.source,
          }),
        ),
    );
    setOpenModal(true);
  }, [setOpenModal]);

  useEffect(() => {
    async function buildWalletAccount(extAcc: ExtensionAccount) {
      const signer = await web3FromAddress(extAcc.address);
      return {
        address: extAcc.address,
        source: extAcc.source,
        name: extAcc.name,
        signer,
        wallet: {
          enable: () => undefined,
          extensionName: 'polkadot-js',
          title: 'Nova Wallet',
          installUrl: 'https://novawallet.io/',
          logo: {
            src: logo,
            alt: 'Nova Wallet',
          },
          installed: true,
          extension: undefined,
          signer,
          /**
           * The following methods are tagged as 'Unused' since they are only required by the @talisman package,
           * which we are not using to handle this wallet connection.
           */
          getAccounts: () => Promise.resolve([]), // Unused
          subscribeAccounts: () => undefined, // Unused
          transformError: (err: any) => err, // Unused
        },
      };
    }
    if (selectedAccount) {
      buildWalletAccount(selectedAccount)
        .then((account) => setWalletAccount(account))
        .then(() => {
          setOpenModal(false);
        })
        .catch((error) => console.error(error));
    }
  }, [selectedAccount]);

  return (
    <div className="-mt-8">
      <Modal open={openModal} responsive={true}>
        <h1 className="text-lg">Select your Nova account</h1>
        <div>
          {accounts.map((a) => (
            <button
              className={`flex items-center gap-4 p-4 rounded-xl text-left w-full bg-[var(--modal-control-background)] hover:bg-[var(--modal-active-background)]`}
              onClick={() => setSelectedAccount(a)}
            >
              <img src={logo} width="32" height="32" alt="Nova Wallet" />
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
        <img src={logo} width="32" height="32" alt="Nova Wallet" />
        Nova Wallet
      </button>
    </div>
  );
};

export default NovaWallet;
