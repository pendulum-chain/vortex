# Consumer app client boundary

Scope: `apps/stocks` and `packages/consumer-kit`. The Stocks pilot is served at `/pt-br/stocks/`
(Brazil/Pix). Demo and preview builds also publish a simulated English/Base USDC edition at
`/en/stocks/`; a live build has none. Gold retains its existing implementation. This client boundary
adds no server endpoint, signing authority or chain executor. The server's stock corridor is
specified in `03-ramp-engine/ramp-phase-flows.md` and `05-integrations/relay.md`, and stays off until
`STOCKS_ENABLED_DIRECTIONS` lists a direction.

## Modes and execution

- Demo uses simulated identity, prices and ramps. Preview uses Privy identity and simulated
  ramps. Neither mode may register a real ramp, request wallet signatures, or expose a payable
  Pix code. The mode is visibly labelled. Netlify deploy previews use demo.
- Live additionally requires `VITE_STOCKS_RAMP_ENABLED=true` and API availability for the
  configured network, with a token counted only on its allowlisted contract address and 18 decimals.
  Until then buying displays “em breve”, as it does while the API does not know the network or
  `STOCKS_ENABLED_DIRECTIONS` lists no direction. A failed listing promises neither.
- Quotes name the token by symbol, which the server's allowlist pins to one contract. The client
  keeps its own pin on the address: the listing above, a buy's delivery and a sell's permit.
- The USDC checkout is a simulation in demo and preview builds only. It exposes no real payment
  address or wallet signature. A live build offers no USDC option or link and has no USDC or English
  chunk, which CI checks on a real live build. Zero Stocks markup is enforced; provider fees are
  disclosed separately.
- If the live flag is turned off, which needs a rebuild, status reads stay available for an existing
  registered operation, while quotes, registration, resuming a sell and start are refused. A device
  retains one active recovery slot per wallet,
  across payment rails. Another wallet cannot replace it or inspect its contents, and is not blocked
  by it. Records stored in the earlier single-slot format remain readable and convert on the next write.
- A failed or abandoned operation leaves a device history row with its operation code and any known
  hash, written before its record is cleared; if the row cannot be written the record stays. The API's
  worker can still start a paid Pix ramp up to 3 days later, so an expired Pix is abandoned only on
  the user's word, or when its registration never finished here and so no code was shown, and only
  while the server still reports `initial`; a started ramp keeps its record.
- A quote is bound to direction, network, token symbol, input amount and expiry. Invalid,
  missing or inconsistent fee fields fail closed before presentation or registration.
- A registered buy shows no Pix code unless its one delivery transfer sends the quoted token to this
  wallet in exactly the quoted amount, on the confirmed quote and BRL amount. A resume of such a ramp
  shows none either. This catches a wrong registration; execution stays with the server.
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
- Secret keys, seeds and provider credentials must never enter `VITE_*` variables. The app sends no
  API key, and the build rejects a Vortex secret key in any `VITE_*` variable.
- A live sell signs one EIP-2612 permit and nothing else: the policy lists only that phase, and a
  sell quote that is not `gasless` is refused before registration. Signing the backend's one-transfer
  fallback in the app stays off (RISK-034). The permit must match the chain,
  the sold token and the recorded amount exactly, with the seller as owner, a deadline at most
  3900 s away, the token's current nonce read from the chain right before signing, and as spender
  the ephemeral this device generated for the ramp, kept on its recovery record and never taken from
  the API. A sell signed again therefore shares the earlier permit's nonce, and the token accepts at
  most one of them. A resume without that record signs nothing. Other typed
  data, router calls and native value fail closed. The kit's validator also accepts exact token
  approve/transfer calldata for a policy that lists them, which this app's does not.
  This bounds what the wallet signs, not what the API asks the ephemeral to presign: the SDK
  presigns whatever it receives, so the wallet-side bound is this token and this amount.
- A durable uncertain-broadcast marker precedes each wallet send. Lost RPC responses or failed
  hash persistence block re-signing until reconciliation; a ramp timeout cannot discard that
  marker. Known broadcast hashes and that marker keep the record through failed/age-abandoned
  status for a day from registration, because a server failure is not proof of refund; the record
  then moves to the device history, so a dead operation cannot hold the wallet forever. A definite wallet rejection's null checkpoint is
  not a broadcast. Known hashes resume by awaiting receipts. The start-window check runs before
  registration and immediately before signing or sending; a resumed sell already signed but not
  started is released once the window has closed, as its start would be refused. An open wallet confirmation cannot be
  revoked reliably by the client, but a permit signed past the window moves nothing, because the
  API refuses its update and the start. API integrity and server validation remain part of the
  trust boundary.
- Web Locks serialize registration and each ramp's wallet phase across same-origin tabs; a
  browser without Web Locks cannot register or broadcast. Checkpoints are read inside the lock.
- Portfolio quantities use raw bigint balances and the onchain corporate-action multiplier.
  The client guard blocks only known deviations above 5%. An unavailable or stale reference shows a
  note and does not block. The server price guard is the control, and display data is not an
  executable price guarantee.
- The client reads both issuer pause flags fresh before quoting and refuses on a pause or a failed
  read; the server enforces them at quote and at execution. A failed balance read rejects
  the snapshot so the UI retains last good holdings as stale rather than displaying zero.
- KYC retries bounded transient/reconciliation failures, restarts rejected/expired attempts,
  validates CPF check digits and ignores responses after the flow closes. A returning user's
  readiness refreshes the provider's attempt first: an attempt in review opens no form, and a state
  it cannot read is an error, never “not started”. A submission the API refuses goes back to the form;
  one with an unknown outcome keeps the same payload, which the server needs to reconcile it. The
  selfie window starts as the app's own `about:blank`, so the kit accepts only an `https` liveness
  URL and closes the window on anything else. A
  terminal Privy initialization error offers a reload instead of queuing login indefinitely.

## Hosting and verification

- Stocks inherits a scoped anti-framing policy and remains `noindex` until launch. That policy does
  not restrict scripts (RISK-033). Existing widget proxy routes, Gold paths and real 404 behavior
  remain covered by routing tests.
- A build fails on an invalid mode or a missing Privy app ID, and a Netlify production build fails
  unless the mode is `live`. CI builds the live bundle and fails if it has the USDC checkout, the
  English page or the demo links.
- `apps/stocks/tests` covers mode isolation, quote validation, recovery, gas and amount maths, and
  compares the token allowlist with `packages/shared/src/tokens/evm/config.ts`.
  `packages/consumer-kit/tests` covers session binding, storage, signing and checkpoints.
  `apps/api/src/tests/corridors/stocks-app.e2e.test.ts` runs the real adapter, kit and SDK against the
  real API with a fake chain and wallet, which is not evidence of a real embedded wallet signing on
  chain 4663.
- `apps/stocks/scripts/verify-pilot-ui.mjs` checks a no-money purchase at desktop and mobile
  widths, with real ramp endpoints blocked. This is not evidence of a production Privy login,
  completed Pix settlement or a working Robinhood Chain backend.
- `verify-usdc-ui.mjs` covers partial funding, reload, cross-rail recovery, purchase and sale.
  `verify-review-ui.mjs` covers KYC restart/cancellation, initialization errors and two-tab
  checkpoint serialization plus Pix maintenance/expiry with fake providers only; it needs
  the local Vite dev server. React DOM regression tests inspect every wallet-switch commit.

## Anonymous purchase preview

- Landing pages and signed-out asset pages expose an advisory estimate before login. It uses
  reference prices and explicitly illustrative round placeholder fees, including a full initial ETH
  reserve for an unknown wallet. It never creates a quote, account, deposit address, approval or
  payment. A live build's preview offers Pix only, and the live Pix gate remains in force.
- What survives sign-in is only a bundled symbol, payment method, validated plain-decimal amount
  and locale, in a Stocks-only per-tab session key. It expires after 30 minutes. Unknown
  assets, methods, locales, fractional BRL, unsafe amounts and future-dated drafts fail closed.
  English accepts only USDC, and a live build opens nothing for a saved USDC choice. Storage failure
  keeps the visitor at the preview.
- OAuth returns may restore this selection; cancelling login or logging out clears it. An
  explicit purchase skips the informational welcome, but never the existing Vortex OTP,
  identity check, fresh availability/issuer-pause read, executable quote validation or
  explicit payment consent. No price, fee, quote identifier, wallet or consent is restored.
- Checkout mounts only after the runtime and authenticated wallet are ready and the
  device's active-ramp record has been checked. Existing recovery takes precedence
  over the preview amount and symbol, including an English OAuth return in a non-live build.
