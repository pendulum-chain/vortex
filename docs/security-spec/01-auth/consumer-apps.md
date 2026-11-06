# Consumer app client boundary

Scope: `apps/stocks` and `packages/consumer-kit`. The Stocks pilot is served at
`/pt-br/stocks/` (Brazil/Pix) and `/en/stocks/` (English/Base USDC). Gold retains its existing
implementation. This client boundary adds no server endpoint, signing authority or chain executor.
The server's stock corridor is specified in `03-ramp-engine/ramp-phase-flows.md`, and stays off until
`STOCKS_ENABLED_DIRECTIONS` lists a direction.

## Modes and execution

- Demo uses simulated identity, prices and ramps. Preview uses Privy identity and simulated
  ramps. Neither mode may register a real ramp, request wallet signatures, or expose a payable
  Pix code. The mode is visibly labelled. Netlify deploy previews use demo.
- Live additionally requires `VITE_STOCKS_RAMP_ENABLED=true` and API availability for the
  configured network and allowlisted token address. Until then buying displays “em breve”.
- The server corridor does not yet meet this client's checks. It identifies tokens by symbol
  while the client sends and validates addresses, and a `gasless` sell needs a permit signature
  the signing policy below refuses. Either difference keeps the live route closed for this client.
- USDC checkout remains simulated in demo/preview and independently disabled in live until
  Vortex confirms its crypto order/funding contract. It exposes no real payment address or
  wallet signature. Zero Stocks markup is enforced; provider fees are disclosed separately.
- Recovery/status calls remain available for an existing registered operation if the live
  flag is subsequently disabled. A device retains one active recovery slot across wallets
  and payment rails. Another wallet cannot replace it or inspect its contents.
- A quote is bound to direction, network, token contract, input amount and expiry. Invalid,
  missing or inconsistent fee fields fail closed before presentation or registration.
- Real Pix instructions require a confirmed clear maintenance status and an enabled route.
  While paused, expired or unavailable, QR/copy instructions and confirmation are suppressed.
  Status is polled while visible and invalidated on background/foreground changes; registration,
  start and each new wallet broadcast check the public status again. Recovery records remain.

## Identity, wallet and data

- Stocks uses the same public Privy app ID and origin as Gold. Vortex OTP sessions remain
  bound to the Privy DID and use the compatible sessionStorage key. Application-specific
  recovery/history namespaces do not collide with Gold.
- Logout/session replacement invalidates pending OTP responses, refreshes and authenticated
  retries. A delayed response cannot replace a newer session or replay a mutation under it.
  Server history is tagged with its DID/wallet owner before rendering.
- Portfolio snapshots are bound to both wallet and runtime before rendering. Older identity
  generations and out-of-order reads cannot replace a newer balance snapshot.
- Secret keys, seeds and provider credentials must never enter `VITE_*` variables. The build
  rejects a Vortex secret key in the public-key field.
- Live sells require a code-owned, independently reviewed signing policy. No production
  Robinhood sell policy is configured. The current validator accepts only exact token
  approve/transfer calldata with pinned phase, signer, network and counterparty, zero native
  value and an aggregate amount within consent. Unknown router calls and permits fail closed.
- A durable uncertain-broadcast marker precedes each wallet send. Lost RPC responses or failed
  hash persistence block re-signing until reconciliation; a ramp timeout cannot discard that
  marker. Known broadcast hashes also survive failed/age-abandoned status until reconciliation;
  a server failure is not proof of refund. A definite wallet rejection's null checkpoint is
  not a broadcast. Known hashes resume by awaiting receipts. Gas and start-window checks run before
  registration and immediately before sending. An open wallet confirmation cannot be revoked
  reliably by the client; live sell activation also requires a confirmed backend protocol for
  this deadline case. API integrity and server validation remain part of the trust boundary.
- Web Locks serialize registration and each ramp's wallet phase across same-origin tabs; a
  browser without Web Locks cannot register or broadcast. Checkpoints are read inside the lock.
- Portfolio quantities use raw bigint balances and the onchain corporate-action multiplier.
  Execution guards reject unavailable or stale reference prices; display data is not an
  executable price guarantee.
- Both issuer pause flags must be known false before execution. A failed balance read rejects
  the snapshot so the UI retains last good holdings as stale rather than displaying zero.
- KYC retries bounded transient/reconciliation failures, restarts rejected/expired attempts,
  validates CPF check digits and ignores responses after the flow closes. A terminal Privy
  initialization error offers a reload instead of queuing login indefinitely.

## Hosting and verification

- Stocks inherits a scoped anti-framing policy and remains `noindex` until launch. Existing
  widget proxy routes, Gold paths and real 404 behavior remain covered by routing tests.
- `apps/stocks/tests` covers mode isolation, quote validation, recovery, gas and amount maths.
  `packages/consumer-kit/tests` covers session binding, storage, signing and checkpoints.
- `apps/stocks/scripts/verify-pilot-ui.mjs` checks a no-money purchase at desktop and mobile
  widths, with real ramp endpoints blocked. This is not evidence of a production Privy login,
  completed Pix settlement or a working Robinhood Chain backend.
- `verify-usdc-ui.mjs` covers partial funding, reload, cross-rail recovery, purchase and sale.
  `verify-review-ui.mjs` covers KYC restart/cancellation, initialization errors and two-tab
  checkpoint serialization plus Pix maintenance/expiry with fake providers only; it needs
  the local Vite dev server. React DOM regression tests inspect every wallet-switch commit.
- `quote-pilot.mjs` performs quote-only research and never submits transactions or orders.
  Reports belong outside the public repository. They distinguish included fees, external
  gas, estimated output and the slippage minimum; inferred FX is identified explicitly.

## Anonymous purchase preview

- Brazil and English landing pages and signed-out asset pages expose an advisory estimate
  before login. It uses reference prices and explicitly illustrative provider fees, including
  a full initial network-fee reserve for an unknown wallet. It never creates a quote, account,
  deposit address, approval or payment. The live Pix and USDC gates remain in force.
- The handoff retains only a bundled symbol, payment method, validated plain-decimal amount
  and locale, in a Stocks-only per-tab session key. It expires after 30 minutes. Unknown
  assets, methods, locales, fractional BRL, unsafe amounts and future-dated drafts fail closed.
  English accepts only USDC. Storage failure keeps the visitor at the preview.
- OAuth returns may restore this selection; cancelling login or logging out clears it. An
  explicit purchase skips the informational welcome, but never the existing Vortex OTP,
  identity check, fresh availability/issuer-pause read, executable quote validation or
  explicit payment consent. No price, fee, quote identifier, wallet or consent is restored.
- Checkout mounts only after the runtime and authenticated wallet are ready and the
  device's active-ramp record has been checked. Existing Pix/USDC recovery takes precedence
  over the preview amount and symbol, including an English OAuth return.
