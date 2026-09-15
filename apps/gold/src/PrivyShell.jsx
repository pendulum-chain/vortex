import { useMemo } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { mainnet } from "viem/chains";
import { App } from "./App.jsx";

function AuthenticatedApp() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const embedded = wallets.find((wallet) => wallet.walletClientType === "privy") || wallets[0];
  const email = user?.google?.email || user?.email?.address || "";
  const name = user?.google?.name || email.split("@")[0] || "Olá";
  const auth = useMemo(() => ({ ready, authenticated, user: { name, firstName: name.split(" ")[0], email }, address: embedded?.address, login, logout, getEthereumProvider: () => embedded?.getEthereumProvider() }), [ready, authenticated, name, email, embedded, login, logout]);
  if (!ready) return <div className="app-loading"><span><b>ouro<span className="gold-period">.</span></b><i /></span></div>;
  return <App auth={auth} demo={false} />;
}

export function PrivyShell({ appId }) {
  return <PrivyProvider appId={appId} config={{ loginMethodsAndOrder: { primary: ["google"], overflow: ["email"] }, appearance: { theme: "light", accentColor: "#1F513F" }, embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } }, defaultChain: mainnet, supportedChains: [mainnet] }}><AuthenticatedApp /></PrivyProvider>;
}
