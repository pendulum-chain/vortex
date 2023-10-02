import { ApiPromise, WsProvider } from '@polkadot/api';
import { StorageKey } from '@polkadot/types';
import { AccountId32 } from '@polkadot/types/interfaces';
import { FrameSystemAccountInfo, PalletBalancesAccountData } from '@polkadot/types/lookup';
import BN from 'bn.js';

export interface StatsData {
  totalIssuance: string;
  totalTransferable: string;
  totalLocked: string;
  totalReserved: string;
}

export const getStatsData = async (rpcEndpoint: string | undefined) => {
  if (!rpcEndpoint) return undefined;

  const wsProvider = new WsProvider(rpcEndpoint);
  const api = await ApiPromise.create({ provider: wsProvider, noInitWarn: true });
  const accounts = await api.query.system.account.entries();

  let totalIssuance = new BN(0);
  let totalTransferable = new BN(0);
  let totalLocked = new BN(0);
  let totalReserved = new BN(0);

  accounts.forEach((entry: [StorageKey<[AccountId32]>, FrameSystemAccountInfo]) => {
    const balances = entry[1].toHuman().data as unknown as PalletBalancesAccountData;
    const free = new BN(balances.free.toString().replace(/,/g, ''));
    const miscFrozen = new BN(balances.miscFrozen.toString().replace(/,/g, ''));
    const feeFrozen = new BN(balances.feeFrozen.toString().replace(/,/g, ''));
    const frozen = miscFrozen > feeFrozen ? miscFrozen : feeFrozen;
    const reserved = new BN(balances.reserved.toString().replace(/,/g, ''));

    totalIssuance = totalIssuance.add(free).add(reserved);
    totalTransferable = totalTransferable.add(free).sub(frozen);
    totalLocked = totalLocked.add(frozen);
    totalReserved = totalReserved.add(reserved);
  });

  const format = (n: BN) => {
    let letters = n.toString(10).padStart(13, '0').slice(0, -9);
    let str = `${letters.slice(-6, -3)}.${letters.slice(-3)}`;
    letters = letters.slice(0, -6);
    while (letters.length) {
      str = `${letters.slice(-3)},${str}`;
      letters = letters.slice(0, -3);
    }
    return str;
  };

  return {
    totalIssuance: format(totalIssuance),
    totalTransferable: format(totalTransferable),
    totalLocked: format(totalLocked),
    totalReserved: format(totalReserved),
  };
};
