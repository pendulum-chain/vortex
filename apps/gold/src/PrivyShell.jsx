import { useEffect, useMemo } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { mainnet } from "viem/chains";

function AuthBridge({ onAuth }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const embedded = wallets.find((wallet) => wallet.walletClientType === "privy") || wallets[0];
  const email = user?.google?.email || user?.email?.address || "";
  const name = user?.google?.name || email.split("@")[0] || "Olá";
  const auth = useMemo(() => ({ ready, authenticated, user: { name, firstName: name.split(" ")[0], email }, address: embedded?.address, login, logout, getEthereumProvider: () => embedded?.getEthereumProvider() }), [ready, authenticated, name, email, embedded, login, logout]);
  // App lives outside PrivyProvider so the landing does not wait for this chunk.
  useEffect(() => { onAuth(auth); }, [auth, onAuth]);
  return null;
}

export function PrivyShell({ appId, onAuth }) {
  return <PrivyProvider appId={appId} config={{ loginMethodsAndOrder: { primary: ["google"], overflow: ["email"] }, appearance: { theme: "light", accentColor: "#1F513F" }, embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } }, defaultChain: mainnet, supportedChains: [mainnet] }}><AuthBridge onAuth={onAuth} /></PrivyProvider>;
}
