import {
  type LinkedAccountWithMetadata,
  PrivyProvider,
  useCreateWallet,
  useExportWallet,
  usePrivy,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useSyncJwtBasedAuthState,
  useWallets
} from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@xstate/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hexToBytes } from "viem";
import { useRampActor } from "../contexts/rampState";
import { waitForTransactionConfirmation } from "../helpers/safe-wallet/waitForTransactionConfirmation";
import { ProfileWallet, WalletMode, WalletsResponse, WalletsService } from "../services/api/wallets.service";
import { AuthService } from "../services/auth";
import { privyWidgetConfig } from "./config";
import { EvmWalletSigningAdapter, setActiveEvmWalletSigningAdapter } from "./signingAdapter";
import { WidgetEvmWallet, WidgetWalletContext } from "./WidgetWalletContext";

interface PrivyWidgetWalletRuntimeProps {
  children: React.ReactNode;
  connectExternalWallet: () => Promise<void>;
  mode: WalletMode;
  onModeChange: (mode: WalletMode, wallet?: ProfileWallet) => void;
}

interface PrivyWidgetWalletProviderRuntimeProps extends PrivyWidgetWalletRuntimeProps {
  appId: string;
  clientId?: string;
}

function isPrivyEmbeddedWallet(wallet: { type: string; walletClientType?: string }): boolean {
  return wallet.type === "ethereum" && (wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2");
}

export function PrivyWidgetWalletRuntime({
  children,
  connectExternalWallet,
  mode,
  onModeChange
}: PrivyWidgetWalletRuntimeProps) {
  const rampActor = useRampActor();
  const walletSetupRequested = useSelector(rampActor, state => state.matches("EmbeddedWallet"));
  const queryClient = useQueryClient();
  const { createWallet } = useCreateWallet();
  const { exportWallet } = useExportWallet();
  const { user: privyUser } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { signMessage } = useSignMessage();
  const { signTypedData } = useSignTypedData();
  const { ready: walletsReady, wallets } = useWallets();
  const [creating, setCreating] = useState(false);

  const getExternalJwt = useCallback(async () => AuthService.getTokens()?.accessToken, []);
  const subscribeToAuth = useCallback((onChange: () => void) => AuthService.subscribe(onChange), []);
  const { state: authState } = useSyncJwtBasedAuthState({
    enabled: AuthService.isAuthenticated(),
    getExternalJwt,
    subscribe: subscribeToAuth
  });

  const embeddedWallet = wallets.find(isPrivyEmbeddedWallet);
  const address = embeddedWallet?.address as `0x${string}` | undefined;
  const linkedEmbeddedWallet = privyUser?.linkedAccounts.find(
    (account): account is Extract<LinkedAccountWithMetadata, { type: "wallet" }> =>
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      (account.walletClientType === "privy" || account.walletClientType === "privy-v2") &&
      account.address.toLowerCase() === address?.toLowerCase()
  );

  const signingAdapter = useMemo<EvmWalletSigningAdapter | null>(() => {
    if (!address) return null;
    return {
      address,
      kind: "privy_embedded",
      sendTransaction: async transaction => {
        const result = await sendTransaction(
          {
            chainId: transaction.chainId,
            data: transaction.data,
            gasLimit: transaction.gas,
            to: transaction.to,
            value: transaction.value
          },
          { address, sponsor: privyWidgetConfig.gasPolicy === "sponsored" }
        );
        return result.hash;
      },
      signTypedData: async typedData => {
        const domain = {
          ...(typedData.domain.chainId !== undefined ? { chainId: Number(typedData.domain.chainId) } : {}),
          ...(typedData.domain.name ? { name: typedData.domain.name } : {}),
          ...(typedData.domain.salt ? { salt: Uint8Array.from(hexToBytes(typedData.domain.salt)).buffer } : {}),
          ...(typedData.domain.verifyingContract ? { verifyingContract: typedData.domain.verifyingContract } : {}),
          ...(typedData.domain.version ? { version: typedData.domain.version } : {})
        };
        const result = await signTypedData(
          {
            domain,
            message: typedData.message,
            primaryType: typedData.primaryType,
            types: typedData.types
          },
          { address }
        );
        return result.signature as `0x${string}`;
      },
      waitForTransaction: waitForTransactionConfirmation
    };
  }, [address, sendTransaction, signTypedData]);

  const register = useCallback(
    async (wallet: { address: string; id?: string | null }) => {
      if (!wallet.id) throw new Error("Privy did not return an embedded wallet ID");
      const response = await WalletsService.registerPrivyWallet({
        address: wallet.address,
        providerWalletId: wallet.id
      });
      queryClient.setQueryData<WalletsResponse>(["wallets", AuthService.getUserId()], current => ({
        mode: response.mode,
        wallets: current?.wallets.some(item => item.id === response.wallet.id)
          ? (current.wallets ?? [])
          : [...(current?.wallets ?? []), response.wallet]
      }));
      onModeChange(response.mode, response.wallet);
      rampActor.send({ address: response.wallet.address, type: "EMBEDDED_WALLET_READY" });
    },
    [onModeChange, queryClient, rampActor]
  );

  const createEmbeddedWallet = useCallback(async () => {
    setCreating(true);
    try {
      if (embeddedWallet && linkedEmbeddedWallet) {
        await register(linkedEmbeddedWallet);
      } else {
        await register(await createWallet());
      }
    } catch (cause) {
      rampActor.send({
        error: cause instanceof Error ? cause : new Error("Could not create the embedded wallet"),
        type: "EMBEDDED_WALLET_FAILED"
      });
    } finally {
      setCreating(false);
    }
  }, [createWallet, embeddedWallet, linkedEmbeddedWallet, rampActor, register]);

  const autoCreateStarted = useRef(false);
  useEffect(() => {
    if (!walletSetupRequested) {
      autoCreateStarted.current = false;
    }
  }, [walletSetupRequested]);

  useEffect(() => {
    if (!walletSetupRequested || autoCreateStarted.current || !walletsReady || authState.status !== "done") {
      return;
    }
    autoCreateStarted.current = true;
    void createEmbeddedWallet();
  }, [authState.status, createEmbeddedWallet, walletSetupRequested, walletsReady]);

  const switchToExternalWallet = useCallback(async () => {
    await WalletsService.setMode("external");
    onModeChange("external");
    await connectExternalWallet();
  }, [connectExternalWallet, onModeChange]);

  const value = useMemo<WidgetEvmWallet>(
    () => ({
      activateSigner: () => setActiveEvmWalletSigningAdapter(signingAdapter),
      address,
      canUseEmbeddedWallet: true,
      connectExternalWallet,
      connected: Boolean(address),
      createEmbeddedWallet: () => rampActor.send({ type: "REQUEST_EMBEDDED_WALLET" }),
      creatingEmbeddedWallet: creating,
      exportEmbeddedWallet: async () => {
        if (!address) throw new Error("No embedded wallet is available to export");
        await exportWallet({ address });
      },
      mode,
      ready: walletsReady,
      signMessage: async message => {
        if (!address) throw new Error("The embedded wallet is not ready");
        const result = await signMessage({ message }, { address });
        return result.signature as `0x${string}`;
      },
      switchToExternalWallet
    }),
    [
      address,
      connectExternalWallet,
      creating,
      exportWallet,
      mode,
      rampActor,
      signMessage,
      signingAdapter,
      switchToExternalWallet,
      walletsReady
    ]
  );

  return <WidgetWalletContext value={value}>{children}</WidgetWalletContext>;
}

export function PrivyWidgetWalletProviderRuntime({ appId, clientId, ...runtimeProps }: PrivyWidgetWalletProviderRuntimeProps) {
  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={{
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          showWalletUIs: true
        }
      }}
    >
      <PrivyWidgetWalletRuntime {...runtimeProps} />
    </PrivyProvider>
  );
}
