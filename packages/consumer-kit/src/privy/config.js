// Privy configuration shared by every consumer app on www.vortexfinance.co. Pure (no Privy
// import) so it is unit-tested. One app id + the same login methods on the same origin = one
// Privy user and one embedded wallet across Gold, Stocks and later Family Safe.
import { withRpcOverride } from "../chains.js";
import { CONSUMER_SIGN_IN, LEGAL_URLS } from "../sign-in.js";

// MUST match Gold's PrivyShell (apps/gold/src/PrivyShell.jsx): a user created with Google in
// Gold has to find Google in Stocks on a new device.
export const CONSUMER_LOGIN_METHODS = Object.freeze({ primary: Object.freeze(["google"]), overflow: Object.freeze(["email"]) });

// Wallets that can fund an embedded wallet. Privy creates a connector only for wallets in the config's
// own list, so the provider passes this same list on to connectWallet.
export const FUNDING_WALLETS = Object.freeze(["detected_ethereum_wallets", "metamask", "coinbase_wallet", "wallet_connect"]);

// "Entrar com Vortex" and the legal links live in ../sign-in.js (also exported by the eager entry).
export { CONSUMER_SIGN_IN, LEGAL_URLS } from "../sign-in.js";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * @param {{ brand:{accentColor:string, logoUrl?:string, loginMessage?:string},
 *           defaultChain:import("viem").Chain, extraChains?:import("viem").Chain[], rpcOverrides?:Record<number,string>,
 *           externalWalletFunding?:boolean }} args
 *   brand.accentColor is the product colour ("#RRGGBB"); the modal header is always CONSUMER_SIGN_IN.button.
 *   defaultChain is the embedded wallet's chain: the first supported one. externalWalletFunding adds the
 *   wallets that can be connected to send funds; none of them is a way to sign in.
 * @returns {import("@privy-io/react-auth").PrivyClientConfig}
 */
export function createPrivyConfig({ brand, defaultChain, extraChains = [], rpcOverrides = {}, externalWalletFunding = false }) {
  if (!HEX_COLOR.test(brand?.accentColor ?? "")) throw new Error(`Privy accentColor must be "#RRGGBB", got "${brand?.accentColor}".`);
  if (!defaultChain?.id) throw new Error("createPrivyConfig needs a defaultChain.");
  const chains = [defaultChain, ...extraChains]
    .filter((chain, index, all) => all.findIndex((other) => other.id === chain.id) === index)
    .map((chain) => withRpcOverride(chain, rpcOverrides[chain.id]));
  return {
    // loginMethodsAndOrder replaces appearance.walletList (Privy then creates no wallet connector), so a
    // funding config names its login methods instead. Neither list offers a wallet as a login.
    ...(externalWalletFunding
      ? { loginMethods: [...CONSUMER_LOGIN_METHODS.primary, ...CONSUMER_LOGIN_METHODS.overflow] }
      : { loginMethodsAndOrder: { primary: [...CONSUMER_LOGIN_METHODS.primary], overflow: [...CONSUMER_LOGIN_METHODS.overflow] } }),
    appearance: {
      theme: "light",
      accentColor: brand.accentColor,
      landingHeader: CONSUMER_SIGN_IN.button,
      ...(brand.logoUrl ? { logo: brand.logoUrl } : {}),
      ...(brand.loginMessage ? { loginMessage: brand.loginMessage } : {}),
      ...(externalWalletFunding ? { walletList: [...FUNDING_WALLETS], walletChainType: "ethereum-only" } : {}),
    },
    legal: { ...LEGAL_URLS },
    // Unset, Privy follows the app's server setting, which could sign a permit with no wallet window at all.
    embeddedWallets: { showWalletUIs: true, ethereum: { createOnLogin: "users-without-wallets" } },
    // No defaultChain: Privy falls back to the first supported chain for the embedded wallet, but an explicit
    // one is also forced on external wallets, whose WalletConnect session would then send there, not on Base.
    supportedChains: chains,
  };
}

/**
 * ConsumerAuth's user fields from a Privy user. Only a Google login carries a real name; an e-mail
 * login has none, so name and firstName stay "" (apps greet without a name) rather than showing the
 * e-mail's local part ("joao.silva82") as a name.
 * @returns {{name:string, firstName:string, email:string}}
 */
export function consumerProfile(user) {
  const name = String(user?.google?.name || "").trim();
  return { name, firstName: name.split(/\s+/)[0] || "", email: user?.google?.email || user?.email?.address || "" };
}
