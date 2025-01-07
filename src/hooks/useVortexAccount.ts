import { useNetwork } from '../contexts/network';
import { useMemo, useCallback } from 'preact/compat';
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
  const { isDisconnected: isEvmAccountDisconnected, chainId: evmChainId, address: evmAccountAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const address = useMemo(() => {
    if (!isNetworkEVM(selectedNetwork)) {
      return polkadotWalletAccount?.address;
    } else {
      return evmAccountAddress;
    }
  }, [evmAccountAddress, polkadotWalletAccount, selectedNetwork]);

  const isDisconnected = useMemo(() => {
    if (!isNetworkEVM(selectedNetwork)) {
      return !polkadotWalletAccount;
    } else {
      return isEvmAccountDisconnected;
    }
  }, [selectedNetwork, polkadotWalletAccount, isEvmAccountDisconnected]);

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
        const { signature: substrateSignature } = await (polkadotWalletAccount.signer as Signer).signRaw!({
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
