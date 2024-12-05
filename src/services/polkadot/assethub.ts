import { ApiPromise } from '@polkadot/api';
import Big from 'big.js';
import { useMemo } from 'preact/hooks';

import { OfframpingState } from '../offrampingFlow';
import { waitUntilTrue } from '../../helpers/function';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import { useAssetHubNode } from '../../contexts/polkadotNode';
import { useGetRawInputBalance } from './ephemeral';
import { usePolkadotWalletState } from '../../contexts/polkadotWallet';

export function createAssethubAssetTransfer(assethubApi: ApiPromise, receiverAddress: string, rawAmount: string) {
  const receiverId = u8aToHex(decodeAddress(receiverAddress));

  const dest = { V2: { parents: 1, interior: { X1: { Parachain: 2094 } } } };
  const beneficiary = { V2: { parents: 0, interior: { X1: { AccountId32: { network: undefined, id: receiverId } } } } };
  const assets = {
    V2: [
      {
        id: {
          Concrete: { parents: 0, interior: { X2: [{ PalletInstance: 50 }, { GeneralIndex: 1337 }] } },
        },
        fun: { Fungible: rawAmount },
      },
    ],
  };
  const feeAssetItem = 0;
  const weightLimit = 'Unlimited';

  return assethubApi.tx.polkadotXcm.limitedReserveTransferAssets(dest, beneficiary, assets, feeAssetItem, weightLimit);
}

export function useExecuteAssethubXCM() {
  const assetHubNode = useAssetHubNode();
  const getRawInputBalanceHook = useGetRawInputBalance();
  const { walletAccount } = usePolkadotWalletState();

  return useMemo(
    () =>
      async (state: OfframpingState): Promise<OfframpingState> => {
        if (!walletAccount) {
          throw new Error('Wallet account not available');
        }
        if (!assetHubNode) {
          throw new Error('AssetHub node not available');
        }
        const didInputTokenArrivedOnPendulum = async () => {
          const inputBalanceRaw = await getRawInputBalanceHook(state);
          return inputBalanceRaw.gt(Big(0));
        };

        if (!(await didInputTokenArrivedOnPendulum())) {
          const { assetHubXcmTransactionHash, inputAmount } = state;

          if (assetHubXcmTransactionHash === undefined) {
            const tx = createAssethubAssetTransfer(assetHubNode.api, walletAccount.address, inputAmount.raw);
            const { hash } = await tx.signAndSend(walletAccount.address, { signer: walletAccount.signer as any });
            return { ...state, assetHubXcmTransactionHash: hash.toString() };
          }

          await waitUntilTrue(didInputTokenArrivedOnPendulum, 20000);
        }

        return { ...state, phase: 'subsidizePreSwap' };
      },
    [assetHubNode, getRawInputBalanceHook, walletAccount],
  );
}
