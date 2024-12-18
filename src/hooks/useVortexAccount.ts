import { Networks, useNetwork } from '../contexts/network';
import { useMemo } from 'preact/compat';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';
import { useAccount } from 'wagmi';

// For the AssetHub network, we use a chain ID of -1. This is not a valid chain ID
// but we just use it to differentiate between the EVM and Polkadot accounts.
const AssetHubChainId = -1;

// A helper hook to provide an abstraction over the account used.
// The account could be an EVM account or a Polkadot account.
export const useVortexAccount = () => {
  const { selectedNetwork } = useNetwork();

  const { walletAccount: polkadotWalletAccount } = usePolkadotWalletState();
  const { isDisconnected: isEvmAccountDisconnected, chainId: evmChainId, address: evmAccountAddress } = useAccount();

  const address = useMemo(() => {
    if (selectedNetwork === Networks.AssetHub) {
      return polkadotWalletAccount?.address;
    } else {
      return evmAccountAddress;
    }
  }, [evmAccountAddress, polkadotWalletAccount, selectedNetwork]);

  const isDisconnected = useMemo(() => {
    if (selectedNetwork === Networks.AssetHub) {
      return !polkadotWalletAccount;
    } else {
      return isEvmAccountDisconnected;
    }
  }, [selectedNetwork, polkadotWalletAccount, isEvmAccountDisconnected]);

  const chainId = useMemo(() => {
    if (selectedNetwork === Networks.AssetHub) {
      return AssetHubChainId;
    } else {
      return evmChainId;
    }
  }, [selectedNetwork, evmChainId]);

  const type = useMemo(() => {
    if (selectedNetwork === Networks.AssetHub) {
      return 'substrate';
    } else {
      return 'evm';
    }
  }, [selectedNetwork]);

  return {
    isDisconnected,
    chainId,
    address,
    type,
  };
};
