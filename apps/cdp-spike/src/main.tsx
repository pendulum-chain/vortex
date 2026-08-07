import { CDPReactProvider, type Config } from "@coinbase/cdp-react";
import { createRoot } from "react-dom/client";
import { getFreshAccessToken } from "./auth";
import { HostPage } from "./HostPage";
import "./styles.css";
import { WalletSpike } from "./WalletSpike";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element is missing");

const root = createRoot(rootElement);
const isHost = new URLSearchParams(window.location.search).get("role") === "host";
const projectId = import.meta.env.VITE_CDP_PROJECT_ID as string | undefined;

if (isHost) {
  root.render(<HostPage />);
} else if (!projectId) {
  root.render(
    <main className="wallet-shell">
      <section className="card">
        <h1>CDP spike is not configured</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code> and set <code>VITE_CDP_PROJECT_ID</code>.
        </p>
      </section>
    </main>
  );
} else {
  const config: Config = {
    appName: "Vortex CDP compatibility spike",
    customAuth: { getJwt: getFreshAccessToken },
    disableAnalytics: true,
    projectId,
    showCoinbaseFooter: true
  };
  root.render(
    <CDPReactProvider config={config} name="vortex-cdp-spike">
      <WalletSpike />
    </CDPReactProvider>
  );
}
