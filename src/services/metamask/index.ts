import { enablePolkadotSnap } from '@chainsafe/metamask-polkadot-adapter';
import type { MetamaskPolkadotSnap } from '@chainsafe/metamask-polkadot-adapter/build/snap';
import type { InjectedMetamaskExtension } from '@chainsafe/metamask-polkadot-adapter/src/types';
import type { SnapNetworks } from '@chainsafe/metamask-polkadot-types';
import { Signer } from '@polkadot/api/types';
import { web3EnablePromise } from '@polkadot/extension-dapp';
import type { InjectedExtension } from '@polkadot/extension-inject/types';
import { SignerPayloadJSON, SignerPayloadRaw, SignerResult } from '@polkadot/types/types';
import { WalletAccount } from '@talismn/connect-wallets';
import { TenantName } from '../../models/Tenant';

export const WALLET_SOURCE_METAMASK = 'metamask';

export function tenantToSnapNetwork(tenantName: TenantName): SnapNetworks {
  switch (tenantName) {
    case TenantName.Pendulum:
      return 'polkadot';
    case TenantName.Amplitude:
      return 'kusama';
    default:
      return 'kusama';
  }
}

export async function installPolkadotSnap(relayChain: SnapNetworks): Promise<boolean> {
  try {
    await enablePolkadotSnap({ networkName: relayChain });
    console.info('Snap installed!!');
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export async function isPolkadotSnapInstalled(): Promise<boolean> {
  return !!(await getInjectedMetamaskExtension());
}

export async function getInjectedMetamaskExtension(): Promise<InjectedMetamaskExtension | null> {
  const extensions = await web3EnablePromise;
  return getMetamaskExtension(extensions || []) || null;
}

function getMetamaskExtension(extensions: InjectedExtension[]): InjectedMetamaskExtension | undefined {
  return extensions.find((item) => item.name === 'metamask-polkadot-snap') as unknown as
    | InjectedMetamaskExtension
    | undefined;
}

export interface SnapInitializationResponse {
  isSnapInstalled: boolean;
  snap?: MetamaskPolkadotSnap;
}

export async function initiatePolkadotSnap(relayChain: SnapNetworks): Promise<SnapInitializationResponse> {
  try {
    console.info('Attempting to connect to snap...');
    const metamaskPolkadotSnap = await enablePolkadotSnap({ networkName: relayChain });
    console.info('Snap installed!');
    return { isSnapInstalled: true, snap: metamaskPolkadotSnap };
  } catch (e) {
    console.error(e);
    return { isSnapInstalled: false };
  }
}
export interface ExtensionAccount {
  address: string;
  name: string;
  source: string;
  signer: Signer;
}

export async function buildWalletAccount(extAcc: ExtensionAccount) {
  return {
    address: extAcc.address,
    source: extAcc.source,
    name: extAcc.name,
    signer: extAcc.signer as WalletAccount['signer'],
    wallet: {
      enable: () => undefined,
      extensionName: 'polkadot-js',
      title: 'Metamask Wallet',
      installUrl: 'https://metamask.io/',
      installed: true,
      extension: undefined,
      signer: extAcc.signer,
      logo: {
        src: '',
        alt: 'Metamask Wallet',
      },
      /**
       * The following methods are tagged as 'Unused' since they are only required by the @talisman package,
       * which we are not using to handle this wallet connection.
       */
      getAccounts: () => Promise.resolve([]), // Unused
      subscribeAccounts: () => undefined, // Unused
      transformError: (err: Error) => err, // Unused
    },
  };
}

export async function initiateMetamaskInjectedAccount(tenantName: TenantName) {
  const provider = await initiatePolkadotSnap(tenantToSnapNetwork(tenantName));
  if (!provider.isSnapInstalled) {
    const installResult = await installPolkadotSnap(tenantToSnapNetwork(tenantName));
    if (!installResult) {
      console.error('Something went wrong, snap could not be installed.');
      return;
    }
  }
  if (provider.snap) {
    const api = provider.snap.getMetamaskSnapApi();
    const injectedMetamaskAccount: ExtensionAccount = {
      address: await api.getAddress(),
      name: 'Metamask Snap',
      source: WALLET_SOURCE_METAMASK,
      signer: {
        signPayload: async (payload: SignerPayloadJSON) => {
          // TODO casting payload as any is only temporary, we need to fix the types
          const stringResult = await api.signPayloadJSON(payload as any);
          // Metamask snap doesn't provide a request Id, but just the hex string, so
          // adding id: 1 to be compliant with SignerResult
          return { id: 1, signature: stringResult } as SignerResult;
        },
        signRaw: async (raw: SignerPayloadRaw) => {
          const stringResult = await api.signPayloadRaw(raw);
          // Metamask snap doesn't provide a request Id, but just the hex string, so
          // adding id: 1 to be compliant with SignerResult
          return { id: 1, signature: stringResult } as SignerResult;
        },
        update: (id, status) => {
          console.log('Status update for Id %d: %s', id, status.toHuman());
        },
      },
    };
    return await buildWalletAccount(injectedMetamaskAccount);
  }
  return undefined;
}
