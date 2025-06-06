import { Signer, SignerResult } from '@polkadot/types/types';
import { WalletAccount } from '@talismn/connect-wallets';
import type { SessionTypes } from '@walletconnect/types/dist/types/sign-client/session';
import UniversalProvider, { UniversalProviderOpts } from '@walletconnect/universal-provider';
import logo from '../../../assets/wallets/wallet-connect.svg';
import { config } from '../../../config';

export const walletConnectService = {
  provider: undefined as UniversalProvider | undefined,
  session: undefined as { topic: string } | undefined,
  getProvider: async function getProvider(): Promise<UniversalProvider> {
    this.provider =
      this.provider ||
      (await UniversalProvider.init({
        projectId: config.walletConnect.projectId,
        relayUrl: config.walletConnect.url,
        metadata: {
          name: 'Vortex',
          description:
            'Vortex provides a seamless solution for converting stablecoins into fiat currencies, enabling effortless offramps to EUR and ARS.',
          url: 'https://app.vortexfinance.co',
          icons: ['https://app.vortexfinance.co/favicon.png'],
        },
      } as UniversalProviderOpts));
    return this.provider;
  },
  init: async function init(session: SessionTypes.Struct, chainId: string): Promise<WalletAccount> {
    const provider = await this.getProvider();

    this.session = {
      topic: session.topic,
    };

    const wcAccounts = Object.values(session.namespaces)
      .map((namespace) => namespace.accounts)
      .flat();
    // grab account addresses from CAIP account formatted accounts
    const accounts = wcAccounts.map((wcAccount) => {
      const address = wcAccount.split(':')[2];
      return address;
    });

    const signer: Signer = {
      signPayload: async (data) => {
        const { address } = data;

        try {
          return await provider.client.request({
            chainId,
            topic: session.topic,
            request: {
              method: 'polkadot_signTransaction',
              params: {
                address,
                transactionPayload: data,
              },
            },
          });
        } catch (error) {
          console.error('Error signing transaction with signPayload():', error);
          throw error;
        }
      },
      signRaw: async (data) => {
        const { address } = data;
        try {
          return provider.client.request({
            chainId,
            topic: session.topic,
            request: {
              method: 'polkadot_signMessage',
              params: {
                address,
                message: data.data,
              },
            },
          });
        } catch (error) {
          console.error('Error signing transaction with signRaw():', error);
          throw error;
        }
      },
    };
    return {
      address: accounts[0],
      source: 'walletConnect',
      name: 'WalletConnect',
      signer: signer as WalletAccount['signer'],
      wallet: {
        enable: () => undefined,
        extensionName: 'WalletConnect',
        title: 'Wallet Connect',
        installUrl: 'https://walletconnect.com/',
        logo: {
          src: logo,
          alt: 'WalletConnect',
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
        transformError: (err: Error) => err, // Unused
      },
    };
  },
};
