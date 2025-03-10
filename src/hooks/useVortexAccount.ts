import { useNetwork } from '../contexts/network';
import { useMemo, useCallback } from 'react';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';
import { useAccount } from 'wagmi';
import { Signer } from '@polkadot/types/types';
import { useSignMessage } from 'wagmi';
import { isNetworkEVM, ASSETHUB_CHAIN_ID } from '../helpers/networks';

// A helper hook to provide an abstraction over the account used.
// The account could be an EVM account or a Polkadot account.
export const useVortexAccount = () => {
  const { selectedNetwork } = useNetwork();

  const { walletAccount: polkadotWalletAccount } = usePolkadotWalletState();
  const { chainId: evmChainId, address: evmAccountAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const address = useMemo(() => {
    if (!isNetworkEVM(selectedNetwork)) {
      return polkadotWalletAccount?.address;
    } else {
      return evmAccountAddress;
    }
  }, [evmAccountAddress, polkadotWalletAccount, selectedNetwork]);

  const isDisconnected = useMemo(() => {
    if (isNetworkEVM(selectedNetwork)) {
      return !evmAccountAddress;
    } else {
      return !polkadotWalletAccount;
    }
  }, [evmAccountAddress, selectedNetwork, polkadotWalletAccount]);

  const chainId = useMemo(() => {
    if (!isNetworkEVM(selectedNetwork)) {
      return ASSETHUB_CHAIN_ID;
    } else {
      return evmChainId;
    }
  }, [selectedNetwork, evmChainId]);

  const type = useMemo(() => {
    if (!isNetworkEVM(selectedNetwork)) {
      return 'substrate';
    } else {
      return 'evm';
    }
  }, [selectedNetwork]);

  const getMessageSignature = useCallback(
    async (siweMessage: string) => {
      let signature;

      if (isNetworkEVM(selectedNetwork)) {
        signature = await signMessageAsync({ message: siweMessage });
      } else {
        if (!polkadotWalletAccount) {
          throw new Error('getMessageSignature: Polkadot wallet account not found. Wallet must be connected to sign.');
        }
        const signer = polkadotWalletAccount.signer as Signer;
        if (!signer.signRaw) {
          throw new Error('Signer does not support raw signing');
        }
        const { signature: substrateSignature } = await signer.signRaw({
          type: 'payload',
          data: siweMessage,
          address: polkadotWalletAccount.address,
        });
        signature = substrateSignature;
      }

      return signature;
    },
    [polkadotWalletAccount, selectedNetwork, signMessageAsync],
  );

  return {
    isDisconnected,
    chainId,
    address,
    type,
    getMessageSignature,
  };
};
