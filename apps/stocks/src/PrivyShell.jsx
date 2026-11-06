// Lazy chunk (~2 MB): the shared Privy sign-in. The ONLY file that may import Privy
// (tests/import-boundaries.test.mjs). It renders nothing itself: it lifts ConsumerAuth to the
// eagerly rendered app, so the landing never waits for this chunk.
import { ethereum, robinhoodChain } from "@vortexfi/consumer-kit";
import { ConsumerPrivyProvider, createPrivyConfig } from "@vortexfi/consumer-kit/privy";
import { BRAND } from "./brand.js";
import { config } from "./lib/config.js";
import { base } from "viem/chains";
import { getVortexSession } from "./services.js";

// Same app id and login methods as ouro. (one Privy user, one embedded wallet); Robinhood Chain is
// this app's default chain, Ethereum stays available for the same wallet.
const privyConfig = createPrivyConfig({
  brand: { accentColor: BRAND.privy.accentColor, loginMessage: BRAND.privy.loginMessage },
  defaultChain: robinhoodChain,
  extraChains: [ethereum, base],
  rpcOverrides: config.robinhoodRpcUrl ? { [robinhoodChain.id]: config.robinhoodRpcUrl } : {},
});

const englishConfig = { ...privyConfig, appearance: { ...privyConfig.appearance, landingHeader: "Sign in with Vortex", loginMessage: "Sign in with Google or email. If you use Gold, it is the same account and wallet." } };
export default function PrivyShell({ appId, onAuthChange, locale = "pt-BR" }) {
  return <ConsumerPrivyProvider appId={appId} config={locale === "en" ? englishConfig : privyConfig} session={getVortexSession()} onAuthChange={onAuthChange} />;
}
