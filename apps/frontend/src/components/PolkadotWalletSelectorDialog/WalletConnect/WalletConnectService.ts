import { Signer } from "@polkadot/types/types";
import { WalletAccount } from "@talismn/connect-wallets";
import type { SessionTypes } from "@walletconnect/types/dist/types/sign-client/session";
import UniversalProvider, { UniversalProviderOpts } from "@walletconnect/universal-provider";
import logo from "../../../assets/wallets/wallet-connect.svg";
import { config } from "../../../config";

export const walletConnectService = {
  getProvider: async function getProvider(): Promise<UniversalProvider> {
    this.provider =
      this.provider ||
      (await UniversalProvider.init({
        metadata: {
          description:
            "Vortex provides a seamless solution for converting stablecoins into fiat currencies, enabling effortless offramps to EUR and ARS.",
          icons: ["https://app.vortexfinance.co/favicon.png"],
          name: "Vortex",
          url: "https://app.vortexfinance.co"
        },
        projectId: config.walletConnect.projectId,
        relayUrl: config.walletConnect.url
      } as UniversalProviderOpts));
    return this.provider;
  },
  init: async function init(session: SessionTypes.Struct, chainId: string): Promise<WalletAccount> {
    const provider = await this.getProvider();

    this.session = {
      topic: session.topic
    };

    const wcAccounts = Object.values(session.namespaces)
      .map(namespace => namespace.accounts)
      .flat();
    // grab account addresses from CAIP account formatted accounts
    const accounts = wcAccounts.map(wcAccount => {
      const address = wcAccount.split(":")[2];
      return address;
    });

    const signer: Signer = {
      signPayload: async data => {
        const { address } = data;

        try {
          return await provider.client.request({
            chainId,
            request: {
              method: "polkadot_signTransaction",
              params: {
                address,
                transactionPayload: data
              }
            },
            topic: session.topic
          });
        } catch (error) {
          console.error("Error signing transaction with signPayload():", error);
          throw error;
        }
      },
      signRaw: async data => {
        const { address } = data;
        try {
          return provider.client.request({
            chainId,
            request: {
              method: "polkadot_signMessage",
              params: {
                address,
                message: data.data
              }
            },
            topic: session.topic
          });
        } catch (error) {
          console.error("Error signing transaction with signRaw():", error);
          throw error;
        }
      }
    };
    return {
      address: accounts[0],
      name: "WalletConnect",
      signer: signer as WalletAccount["signer"],
      source: "walletConnect",
      wallet: {
        enable: () => undefined,
        extension: undefined,
        extensionName: "WalletConnect",
        /**
         * The following methods are tagged as 'Unused' since they are only required by the @talisman package,
         * which we are not using to handle this wallet connection.
         */
        getAccounts: () => Promise.resolve([]),
        installed: true,
        installUrl: "https://walletconnect.com/",
        logo: {
          alt: "WalletConnect",
          src: logo
        },
        signer,
        subscribeAccounts: () => undefined, // Unused
        title: "Wallet Connect", // Unused
        transformError: (err: Error) => err // Unused
      }
    };
  },
  provider: undefined as UniversalProvider | undefined,
  session: undefined as { topic: string } | undefined
};
