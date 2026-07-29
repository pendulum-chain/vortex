import {
  useAuthenticateWithJWT,
  useCreateEvmEoaAccount,
  useCurrentUser,
  useIsInitialized,
  useSignEvmTransaction,
  useSignEvmTypedData
} from "@coinbase/cdp-hooks";
import { CDPReactProvider, type Config, ExportWalletModal } from "@coinbase/cdp-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ProfileWallet, type WalletMode, WalletsAPI, type WalletsResponse } from "@/services/api/wallets.api";
import { AuthService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth.store";
import { createCdpSigningAdapter } from "./cdpSigningAdapter";
import { selectCdpEmbeddedWallet } from "./cdpWalletSelection";
import { cdpWalletConfig } from "./config";
import { setActiveWalletSigningAdapter } from "./signingAdapter";
import { type WalletExperience, WalletExperienceContext } from "./WalletExperienceContext";

interface CdpWalletRuntimeProps {
  autoCreate: boolean;
  children: React.ReactNode;
  connectExternalWallet: () => Promise<void>;
  onAutoCreateHandled: () => void;
  onModeChange: (mode: WalletMode) => void;
  registeredWallet?: Pick<ProfileWallet, "address" | "providerWalletId">;
}

interface CdpWalletProviderRuntimeProps extends CdpWalletRuntimeProps {
  projectId: string;
}

export function CdpWalletRuntime({
  autoCreate,
  children,
  connectExternalWallet,
  onAutoCreateHandled,
  onModeChange,
  registeredWallet
}: CdpWalletRuntimeProps) {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { createEvmEoaAccount } = useCreateEvmEoaAccount();
  const { currentUser } = useCurrentUser();
  const { isInitialized } = useIsInitialized();
  const { signEvmTransaction } = useSignEvmTransaction();
  const { signEvmTypedData } = useSignEvmTypedData();
  const [authenticated, setAuthenticated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [exportOpen, setExportOpen] = useState(false);
  const authenticationPromise = useRef<Promise<void> | undefined>(undefined);

  useEffect(() => {
    if (!isInitialized) return;
    authenticationPromise.current ??= authenticateWithJWT().then(() => undefined);

    let active = true;
    authenticationPromise.current.then(
      () => {
        if (active) setAuthenticated(true);
      },
      cause => {
        if (active) {
          setError(`Embedded wallet authentication failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [authenticateWithJWT, isInitialized]);

  const embeddedWallet = authenticated ? selectCdpEmbeddedWallet(currentUser, registeredWallet) : undefined;
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;
  const registeredWalletUnavailable = authenticated && Boolean(registeredWallet) && !embeddedWallet;
  const address = registeredWalletUnavailable ? undefined : walletAddress;

  const signingAdapter = useMemo(
    () =>
      address
        ? createCdpSigningAdapter(address, {
            signTransaction: signEvmTransaction,
            signTypedData: signEvmTypedData
          })
        : null,
    [address, signEvmTransaction, signEvmTypedData]
  );

  const register = useCallback(
    async (walletAddressToRegister: string, cdpUserId: string) => {
      const registered = await WalletsAPI.registerCdpWallet({
        address: walletAddressToRegister,
        cdpUserId
      });
      queryClient.setQueryData<WalletsResponse>(["wallets", user?.userId], current => ({
        mode: registered.mode,
        wallets: current?.wallets.some(item => item.id === registered.wallet.id)
          ? (current.wallets ?? [])
          : [...(current?.wallets ?? []), registered.wallet]
      }));
      onModeChange("cdp_embedded");
    },
    [onModeChange, queryClient, user?.userId]
  );

  const createEmbeddedWallet = useCallback(async () => {
    setCreating(true);
    setError(undefined);
    try {
      if (!authenticated || !currentUser) {
        throw new Error("CDP authentication is not ready");
      }
      if (registeredWalletUnavailable) {
        throw new Error("The registered embedded wallet is not available in the current CDP session");
      }
      const walletAddressToRegister = embeddedWallet?.address ?? (await createEvmEoaAccount());
      await register(walletAddressToRegister, currentUser.userId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the embedded wallet");
    } finally {
      setCreating(false);
    }
  }, [authenticated, createEvmEoaAccount, currentUser, embeddedWallet, register, registeredWalletUnavailable]);

  const autoCreateStarted = useRef(false);
  useEffect(() => {
    if (!autoCreate || autoCreateStarted.current || !authenticated) return;
    autoCreateStarted.current = true;
    void createEmbeddedWallet().finally(() => {
      onAutoCreateHandled();
      autoCreateStarted.current = false;
    });
  }, [authenticated, autoCreate, createEmbeddedWallet, onAutoCreateHandled]);

  const switchToExternalWallet = useCallback(async () => {
    await WalletsAPI.setMode("external");
    onModeChange("external");
    await connectExternalWallet();
  }, [connectExternalWallet, onModeChange]);

  const value = useMemo<WalletExperience>(
    () => ({
      activateSigner: () => setActiveWalletSigningAdapter(signingAdapter),
      address,
      canSignOfframp: cdpWalletConfig.offrampEnabled,
      canUseAsOnrampDestination: cdpWalletConfig.onrampEnabled,
      canUseEmbeddedWallet: cdpWalletConfig.provisioningEnabled,
      connectExternalWallet,
      connected: Boolean(address),
      createEmbeddedWallet,
      creatingEmbeddedWallet: creating,
      error:
        error ??
        (registeredWalletUnavailable
          ? "The registered embedded wallet is not available in the current CDP session"
          : undefined),
      exportEmbeddedWallet: async () => {
        if (!address) throw new Error("No embedded wallet is available to export");
        setExportOpen(true);
      },
      mode: "cdp_embedded",
      ready: isInitialized && authenticated,
      switchToExternalWallet
    }),
    [
      address,
      authenticated,
      connectExternalWallet,
      createEmbeddedWallet,
      creating,
      error,
      isInitialized,
      registeredWalletUnavailable,
      signingAdapter,
      switchToExternalWallet
    ]
  );

  return (
    <>
      <WalletExperienceContext value={value}>{children}</WalletExperienceContext>
      {address && (
        <ExportWalletModal
          address={address}
          onIframeError={cause => setError(cause ?? "Secure wallet export failed")}
          open={exportOpen}
          setIsOpen={setExportOpen}
        >
          <span hidden />
        </ExportWalletModal>
      )}
    </>
  );
}

export function CdpWalletProviderRuntime({ projectId, ...runtimeProps }: CdpWalletProviderRuntimeProps) {
  const config = useMemo<Config>(
    () => ({
      appName: "Vortex",
      customAuth: { getJwt: () => AuthService.getFreshAccessToken() },
      disableAnalytics: true,
      projectId,
      showCoinbaseFooter: true
    }),
    [projectId]
  );

  return (
    <CDPReactProvider config={config} name="vortex-dashboard">
      <CdpWalletRuntime {...runtimeProps} />
    </CDPReactProvider>
  );
}
