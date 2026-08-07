import {
  useAuthenticateWithJWT,
  useCreateEvmEoaAccount,
  useCurrentUser,
  useIsInitialized,
  useSignEvmMessage,
  useSignEvmTransaction,
  useSignEvmTypedData
} from "@coinbase/cdp-hooks";
import { CDPReactProvider, type Config, ExportWalletModal } from "@coinbase/cdp-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@xstate/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRampActor } from "../contexts/rampState";
import { ProfileWallet, WalletMode, WalletsResponse, WalletsService } from "../services/api/wallets.service";
import { AuthService } from "../services/auth";
import { createCdpSigningAdapter } from "./cdpSigningAdapter";
import { selectCdpEmbeddedWallet } from "./cdpWalletSelection";
import { cdpWidgetConfig } from "./config";
import { confirmEmbeddedWalletAction } from "./embeddedWalletReview";
import { validateEmbeddedWalletSiweMessage } from "./embeddedWalletSiwe";
import { setActiveEvmWalletSigningAdapter } from "./signingAdapter";
import { WidgetEvmWallet, WidgetWalletContext } from "./WidgetWalletContext";

interface CdpWidgetWalletRuntimeProps {
  children: React.ReactNode;
  connectExternalWallet: () => Promise<void>;
  mode: WalletMode;
  onModeChange: (mode: WalletMode, wallet?: ProfileWallet) => void;
  registeredWallet?: Pick<ProfileWallet, "address" | "providerWalletId">;
}

interface CdpWidgetWalletProviderRuntimeProps extends CdpWidgetWalletRuntimeProps {
  projectId: string;
}

export function CdpWidgetWalletRuntime({
  children,
  connectExternalWallet,
  mode,
  onModeChange,
  registeredWallet
}: CdpWidgetWalletRuntimeProps) {
  const rampActor = useRampActor();
  const walletSetupRequested = useSelector(rampActor, state => state.matches("EmbeddedWallet"));
  const queryClient = useQueryClient();
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { createEvmEoaAccount } = useCreateEvmEoaAccount();
  const { currentUser } = useCurrentUser();
  const { isInitialized } = useIsInitialized();
  const { signEvmMessage } = useSignEvmMessage();
  const { signEvmTransaction } = useSignEvmTransaction();
  const { signEvmTypedData } = useSignEvmTypedData();
  const [authenticated, setAuthenticated] = useState(false);
  const [creating, setCreating] = useState(false);
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
          rampActor.send({
            error: cause instanceof Error ? cause : new Error("Embedded wallet authentication failed"),
            type: "EMBEDDED_WALLET_FAILED"
          });
        }
      }
    );
    return () => {
      active = false;
    };
  }, [authenticateWithJWT, isInitialized, rampActor]);

  const embeddedWallet = authenticated ? selectCdpEmbeddedWallet(currentUser, registeredWallet) : undefined;
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;
  const registeredWalletUnavailable = authenticated && Boolean(registeredWallet) && !embeddedWallet;
  const address = registeredWalletUnavailable ? undefined : walletAddress;

  const signingAdapter = useMemo(
    () =>
      address && cdpWidgetConfig.signingEnabled
        ? createCdpSigningAdapter(address, {
            signTransaction: signEvmTransaction,
            signTypedData: signEvmTypedData
          })
        : null,
    [address, signEvmTransaction, signEvmTypedData]
  );

  useEffect(() => () => setActiveEvmWalletSigningAdapter(null), []);

  const register = useCallback(
    async (walletAddressToRegister: string, cdpUserId: string) => {
      const response = await WalletsService.registerCdpWallet({
        address: walletAddressToRegister,
        cdpUserId
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
      if (!authenticated || !currentUser) {
        throw new Error("CDP authentication is not ready");
      }
      if (registeredWalletUnavailable) {
        throw new Error("The registered embedded wallet is not available in the current CDP session");
      }
      const walletAddressToRegister = embeddedWallet?.address ?? (await createEvmEoaAccount());
      await register(walletAddressToRegister, currentUser.userId);
    } catch (cause) {
      rampActor.send({
        error: cause instanceof Error ? cause : new Error("Could not create the embedded wallet"),
        type: "EMBEDDED_WALLET_FAILED"
      });
    } finally {
      setCreating(false);
    }
  }, [authenticated, createEvmEoaAccount, currentUser, embeddedWallet, rampActor, register, registeredWalletUnavailable]);

  const autoCreateStarted = useRef(false);
  useEffect(() => {
    if (!walletSetupRequested || autoCreateStarted.current || !authenticated) return;
    autoCreateStarted.current = true;
    void createEmbeddedWallet().finally(() => {
      autoCreateStarted.current = false;
    });
  }, [authenticated, createEmbeddedWallet, walletSetupRequested]);

  const switchToExternalWallet = useCallback(async () => {
    await WalletsService.setMode("external");
    onModeChange("external");
    await connectExternalWallet();
  }, [connectExternalWallet, onModeChange]);

  const value = useMemo<WidgetEvmWallet>(
    () => ({
      activateSigner: () => setActiveEvmWalletSigningAdapter(signingAdapter),
      address,
      canExportEmbeddedWallet: cdpWidgetConfig.exportEnabled,
      canUseEmbeddedWallet: true,
      connectExternalWallet,
      connected: Boolean(address),
      createEmbeddedWallet: () => rampActor.send({ type: "REQUEST_EMBEDDED_WALLET" }),
      creatingEmbeddedWallet: creating,
      embeddedUnavailableReason: registeredWalletUnavailable
        ? "The registered embedded wallet is not available in the current CDP session."
        : undefined,
      exportEmbeddedWallet: async () => {
        if (!cdpWidgetConfig.exportEnabled) {
          throw new Error("Embedded wallet export is disabled in this environment");
        }
        if (!address) throw new Error("No embedded wallet is available to export");
        confirmEmbeddedWalletAction("Reveal private key", {
          address,
          warning: "Anyone with this private key has full control of the wallet and its assets."
        });
        setExportOpen(true);
      },
      mode,
      ready: isInitialized && authenticated,
      signMessage: async message => {
        if (!cdpWidgetConfig.signingEnabled) {
          throw new Error("Embedded wallet signing is disabled in this environment");
        }
        if (!address) throw new Error("The embedded wallet is not ready");
        const signInMessage = validateEmbeddedWalletSiweMessage(message, address, window.location.host);
        confirmEmbeddedWalletAction("Sign in to Vortex", {
          ...signInMessage,
          message
        });
        const result = await signEvmMessage({ evmAccount: address, message });
        return result.signature;
      },
      switchToExternalWallet
    }),
    [
      address,
      authenticated,
      connectExternalWallet,
      creating,
      isInitialized,
      mode,
      rampActor,
      registeredWalletUnavailable,
      signEvmMessage,
      signingAdapter,
      switchToExternalWallet
    ]
  );

  return (
    <>
      <WidgetWalletContext value={value}>{children}</WidgetWalletContext>
      {address && cdpWidgetConfig.exportEnabled && (
        <ExportWalletModal address={address} open={exportOpen} setIsOpen={setExportOpen}>
          <span hidden />
        </ExportWalletModal>
      )}
    </>
  );
}

export function CdpWidgetWalletProviderRuntime({ projectId, ...runtimeProps }: CdpWidgetWalletProviderRuntimeProps) {
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
    <CDPReactProvider config={config} name="vortex-widget">
      <CdpWidgetWalletRuntime {...runtimeProps} />
    </CDPReactProvider>
  );
}
