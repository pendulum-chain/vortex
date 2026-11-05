// The shared sign-in copy and legal links. Pure, so the apps' eager bundles can show "Entrar com
// Vortex" before the Privy chunk loads; privy/config.js re-exports them for the Privy modal.

// The shared sign-in is an identity layer, not an account (brand decision v1.0): never
// "Conta Vortex". The noun is used only where one is unavoidable.
export const CONSUMER_SIGN_IN = Object.freeze({
  button: "Entrar com Vortex",
  noun: "ID Vortex",
  connected: "Conectado com Vortex",
  helper: "o mesmo acesso do ouro.",
});

export const LEGAL_URLS = Object.freeze({
  termsAndConditionsUrl: "https://www.vortexfinance.co/pt-br/terms-and-conditions/",
  privacyPolicyUrl: "https://www.vortexfinance.co/pt-br/privacy-policy/",
});
