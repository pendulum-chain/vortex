import { ASSETHUB_CHAIN_ID, getNetworkId, isNetworkEVM, Networks } from "@vortexfi/shared";
import { useCallback, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { useNetwork } from "../contexts/network";
import { usePolkadotWalletState } from "../contexts/polkadotWallet";
import { useRampActor } from "../contexts/rampState";
import { useWidgetWallet } from "../wallets/WidgetWalletContext";

// A helper hook to provide an abstraction over the account used.
// The account could be an EVM account or a Polkadot account.
export const useVortexAccount = (forceNetwork?: Networks) => {
  const { selectedNetwork: contextNetwork } = useNetwork();
  const selectedNetwork = forceNetwork ?? contextNetwork;

  const rampActor = useRampActor();
  const { walletAccount: polkadotWalletAccount } = usePolkadotWalletState();
  const { chainId: externalChainId } = useAccount();
  const evmWallet = useWidgetWallet();
  const evmAccountAddress = evmWallet.address;

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

  const isConnected = useMemo(() => {
    return !isDisconnected;
  }, [isDisconnected]);

  const chainId = useMemo(() => {
    if (!isNetworkEVM(selectedNetwork)) {
      return ASSETHUB_CHAIN_ID;
    } else {
      return evmWallet.mode === "cdp_embedded" ? getNetworkId(selectedNetwork) : externalChainId;
    }
  }, [selectedNetwork, evmWallet.mode, externalChainId]);

  const type = useMemo(() => {
    if (!isNetworkEVM(selectedNetwork)) {
      return "substrate";
    } else {
      return "evm";
    }
  }, [selectedNetwork]);

  const getMessageSignature = useCallback(
    async (siweMessage: string) => {
      // For now, we only always need to sign with EVM accounts
      const signature = await evmWallet.signMessage(siweMessage);

      // if (isNetworkEVM(selectedNetwork)) {
      //   signature = await signMessageAsync({ message: siweMessage });
      // } else {
      //   if (!polkadotWalletAccount) {
      //     throw new Error("getMessageSignature: Polkadot wallet account not found. Wallet must be connected to sign.");
      //   }
      //   const signer = polkadotWalletAccount.signer as Signer;
      //   if (!signer.signRaw) {
      //     throw new Error("Signer does not support raw signing");
      //   }
      //   const { signature: substrateSignature } = await signer.signRaw({
      //     address: polkadotWalletAccount.address,
      //     data: siweMessage,
      //     type: "payload"
      //   });
      //   signature = substrateSignature;
      // }

      return signature;
    },
    [evmWallet]
  );

  // update the ramp actor with the current context
  useEffect(() => {
    if (rampActor && address) {
      rampActor.send({
        address,
        type: "SET_ADDRESS"
      });
    }

    if (isNetworkEVM(selectedNetwork)) {
      evmWallet.activateSigner();
    }

    if (rampActor && !isNetworkEVM(selectedNetwork) && polkadotWalletAccount) {
      rampActor.send({
        type: "SET_SUBSTRATE_WALLET_ACCOUNT",
        walletAccount: polkadotWalletAccount
      });
    }

    rampActor?.send({
      getMessageSignature,
      type: "SET_GET_MESSAGE_SIGNATURE"
    });
  }, [address, rampActor, getMessageSignature, polkadotWalletAccount, selectedNetwork, evmWallet]);

  return {
    address, // currently selected address
    chainId,
    evmAddress: evmAccountAddress,
    getMessageSignature,
    isConnected,
    isDisconnected,
    substrateAddress: polkadotWalletAccount?.address,
    type
  };
};
