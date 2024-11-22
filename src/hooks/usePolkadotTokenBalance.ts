import { ApiPromise, WsProvider } from '@polkadot/api';
import { useEffect, useState } from 'react';
import Big from 'big.js';

interface PolkadotTokenBalanceProps {
  address: string;
  assetId: `0x${string}`;
}

export const usePolkadotTokenBalance = ({ address, assetId }: PolkadotTokenBalanceProps) => {
  const [balance, setBalance] = useState<string>();

  useEffect(() => {
    let api: ApiPromise | undefined;

    const init = async () => {
      try {
        const wsProvider = new WsProvider('wss://polkadot-asset-hub-rpc.polkadot.io');
        api = await ApiPromise.create({ provider: wsProvider });

        const assetAccount = await api.query.assets.account(assetId, address);

        if (assetAccount.isEmpty) {
          setBalance('0');
          return;
        }

        const { balance: rawBalance } = assetAccount.toJSON() as { balance: string };
        const decimals = api.registry.chainDecimals[0];

        const readableBalance = Big(rawBalance).div(Big(10).pow(decimals)).toFixed(2);
        setBalance(readableBalance);
      } catch (error) {
        console.error('Error fetching Polkadot token balance:', error);
        setBalance('0');
      }
    };

    if (address && assetId) {
      init();
    }

    return () => {
      if (api) {
        api.disconnect();
      }
    };
  }, [address, assetId]);

  return balance;
};
