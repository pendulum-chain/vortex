# packages/consumer-kit - shared login and Vortex plumbing for the consumer apps

`@vortexfi/consumer-kit` holds what every consumer showcase on `www.vortexfinance.co` needs
for one shared sign-in and the Vortex BRL/Pix ramp: the Privy config and provider, the shared
browser-storage namespace, the Vortex OTP session client, Brazilian (Avenia) KYC, ramp
tracking, embedded-wallet signing, recovery stores and chain definitions (Ethereum and
Robinhood Chain, id 4663). Logic is lifted from the post-fix Gold code (`apps/gold/src/lib`).

- **Consumers:** `apps/stocks` today. Gold keeps its own copies until its own migration PR.
  Do not change Gold from here, and keep the shared storage keys and shapes compatible with the
  live Gold app.
- **Plain JS ESM, no build step.** Vite consumes the source and `node --test` imports it.
  Excluded from Biome like Gold: keep Gold's style, do not reformat to the monorepo style.
  JSDoc typedefs describe data shapes; no TypeScript.
- **Config is passed in.** No file reads `import.meta.env`; apps read their env once and
  pass `apiBase`, chains and brand values into the factories. `publicKey` is optional, and Stocks
  sends none.
- **Entry points:** `.` (everything except Privy: no static `react`, `@privy-io/*` or
  `@vortexfi/sdk` import, so apps can use it in the eager bundle; the SDK is loaded with a
  dynamic `import()` in `vortex/client.js` only), `./chains`, and `./privy`
  (`createPrivyConfig` + `ConsumerPrivyProvider.jsx`, the only React/Privy file, for a lazy
  chunk). `tests/boundaries.test.mjs` enforces this.
- **One login:** the same Privy app id, `CONSUMER_LOGIN_METHODS` (Google first, e-mail as
  overflow; identical to Gold's `PrivyShell`) and origin give one Privy user and one embedded
  wallet across the apps. The sign-in is branded **"Entrar com Vortex"** (noun "ID Vortex",
  `CONSUMER_SIGN_IN`); never "Conta Vortex". The Privy modal header is fixed by the kit; apps
  pass only their accent colour, logo and login message (Stocks' English simulation translates the
  header and the message).
- **Vortex OTP session:** per-tab `sessionStorage` under Gold's key
  `satoshi:vortex-session:v2`, bound to the Privy DID (`hasSession({email, privyDid})`).
  Refresh is coalesced and only a 401 ends the session. A `localStorage` backend is possible
  by injecting `storage`, but stays off until a CSP and session timeouts exist.
- **Wallet signing fails closed:** `submitWalletTransactions` requires durable checkpoints and an
  explicit code-owned `expect` policy with token, maximum aggregate amount, counterparties and phases.
  It pins signer/chain, accepts exact token approve/transfer calldata and EIP-2612 permits (exact token,
  chain, owner, spender and value, deadline at most 3900 s away) in the phases the policy lists for them,
  and refuses native value, unknown router calls and other typed data. Never derive trusted
  counterparties from the unsigned requests.
  Web Locks serialize phases across tabs; an uncertain-send marker is persisted before broadcasting.
  Known hashes await receipts without another send. The app's optional `beforeSign` check is awaited
  immediately before a signature or broadcast, so fresh maintenance/deadline refusals happen before
  anything leaves.
  The native-gas preflight throws `INSUFFICIENT_NATIVE_GAS` with `{chainId, balanceWei, requiredWei}`,
  so an app can word it for its own case. A zero `gas`/`gasPrice`/`maxFeePerGas` counts as unset
  (Vortex sends `gas: "0"`; as `"0x0"` it once let an empty wallet pass): a transaction without gas
  gets `eth_estimateGas` on the chain's public client (from/to/data/value only) as its gas limit
  before the preflight and the wallet; a failed or zero estimate throws `GAS_ESTIMATE_FAILED`.
  The preflight checks a transaction's own fee cap as is; without one it prices gas at 1.2 x
  `eth_gasPrice`, the cap the wallet sets itself (viem's default).
- **Storage keys:** `satoshi:<app>:<name>:v<n>` via `appKey`; shared keys in `SHARED_KEYS`.
  Never rename a key that holds recovery data (active ramps, ephemeral keys).

Run `bun run test:consumer-kit` from the repository root, or `bun run test` here.
