// Privy configuration shared by every consumer app on www.vortexfinance.co. Pure (no Privy
// import) so it is unit-tested. One app id + the same login methods on the same origin = one
// Privy user and one embedded wallet across Gold, Stocks and later Family Safe.
import { withRpcOverride } from "../chains.js";
import { CONSUMER_SIGN_IN, LEGAL_URLS } from "../sign-in.js";

// MUST match Gold's PrivyShell (apps/gold/src/PrivyShell.jsx): a user created with Google in
// Gold has to find Google in Stocks on a new device.
export const CONSUMER_LOGIN_METHODS = Object.freeze({ primary: Object.freeze(["google"]), overflow: Object.freeze(["email"]) });

// "Entrar com Vortex" and the legal links live in ../sign-in.js (also exported by the eager entry).
export { CONSUMER_SIGN_IN, LEGAL_URLS } from "../sign-in.js";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * @param {{ brand:{accentColor:string, logoUrl?:string, loginMessage?:string},
 *           defaultChain:import("viem").Chain, extraChains?:import("viem").Chain[], rpcOverrides?:Record<number,string> }} args
 *   brand.accentColor is the product colour ("#RRGGBB"); the modal header is always CONSUMER_SIGN_IN.button.
 * @returns {import("@privy-io/react-auth").PrivyClientConfig}
 */
export function createPrivyConfig({ brand, defaultChain, extraChains = [], rpcOverrides = {} }) {
  if (!HEX_COLOR.test(brand?.accentColor ?? "")) throw new Error(`Privy accentColor must be "#RRGGBB", got "${brand?.accentColor}".`);
  if (!defaultChain?.id) throw new Error("createPrivyConfig needs a defaultChain.");
  const chains = [defaultChain, ...extraChains]
    .filter((chain, index, all) => all.findIndex((other) => other.id === chain.id) === index)
    .map((chain) => withRpcOverride(chain, rpcOverrides[chain.id]));
  return {
    loginMethodsAndOrder: { primary: [...CONSUMER_LOGIN_METHODS.primary], overflow: [...CONSUMER_LOGIN_METHODS.overflow] },
    appearance: {
      theme: "light",
      accentColor: brand.accentColor,
      landingHeader: CONSUMER_SIGN_IN.button,
      ...(brand.logoUrl ? { logo: brand.logoUrl } : {}),
      ...(brand.loginMessage ? { loginMessage: brand.loginMessage } : {}),
    },
    legal: { ...LEGAL_URLS },
    // Unset, Privy follows the app's server setting, which could sign a permit with no wallet window at all.
    embeddedWallets: { showWalletUIs: true, ethereum: { createOnLogin: "users-without-wallets" } },
    defaultChain: chains[0],
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
