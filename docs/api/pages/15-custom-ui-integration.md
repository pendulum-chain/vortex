# Custom UI Integration

A custom Vortex UI must coordinate asynchronous quotes, authentication, wallets, payment instructions, and ramp status without letting stale client state drive a transaction. The [Vortex demo](https://github.com/pendulum-chain/vortex/tree/main/apps/demo) illustrates these patterns in a small browser flow; it is an integration reference, not a production storage or security template.

The practices below complement the [SDK Quick Start](https://api-docs.vortexfinance.co/quick-start-with-the-sdk) and [Ramp Lifecycle](https://api-docs.vortexfinance.co/ramp-lifecycle). They apply to any custom UI even when the framework, wallet library, or fiat corridor differs.

## Keep Quotes Bound To Current Input

Amount fields often request a new quote while the user is still typing. Network responses can arrive out of order, so a slower response for an old amount must not replace the current quote.

- Debounce quote requests to avoid sending one request per keystroke.
- Clear the displayed quote as soon as the input becomes invalid or its route changes.
- Cancel superseded requests or tag them with a local request generation and ignore late responses.
- Enable registration only when the resolved quote still matches the current amount, currencies, rail, and network.

Check `expiresAt` again immediately before registration. If the quote has expired, fetch a new one and show the changed output and fees before the user confirms; do not silently transact with updated economics.

## Coordinate Browser Session Refresh

The SDK may call `accessTokenProvider` concurrently when several requests start together. If the access token needs renewal, coalesce those calls into one refresh operation. Store the returned access and refresh tokens together before releasing the result to waiting requests because refresh-token rotation makes the previous pair stale.

Treat a rejected refresh token as an ended session: clear it and ask the user to authenticate again. Treat a transient refresh failure as retryable rather than destroying an otherwise valid session. Never solve browser authentication by embedding an `sk_*`; see [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys).

## Bind Wallet Actions To The Quoted Network

Make the payout network visible next to the destination address. When the address comes from a connected wallet, verify the address format and require the wallet to use the quoted chain before enabling network-specific signing or submission. Offer an explicit network-switch action instead of allowing a later wallet prompt to fail on the wrong chain.

A manually entered destination does not prove wallet ownership. Validate that it is compatible with the quoted network, ask the user to confirm it, and never infer the destination from an unrelated active wallet connection.

## Make Payment Handoffs Resumable

Users may close a tab, lose connectivity, or need to reauthenticate after registration. Persist the `rampId` and enough non-secret UI state to find an unfinished payment, then recover the latest state from `GET /v1/ramp/{id}` when the application resumes. Do not use a copied payment-instruction snapshot as the source of truth.

- Display the exact amount, payment rail, and expiry alongside the instructions.
- Stop presenting instructions as payable when their deadline passes or status indicates that the ramp advanced or failed.
- Remove cached QR codes and bank instructions after they are no longer actionable, while retaining the ramp ID for history and support.
- Keep ephemeral-key backups separate from ordinary UI state and follow [Ephemeral Key Custody](https://api-docs.vortexfinance.co/ephemeral-key-custody).

The demo uses same-origin `localStorage` to make refresh recovery visible with minimal code. That storage is prototype-grade and should not be copied as a production custody design.

## Reconcile An Uncertain Start Result

A timeout or lost response from `startRamp()` does not prove that Vortex rejected the request. The server may have accepted it and advanced the ramp before the client lost the response.

Before showing a failure or retrying start, call `getRampStatus(rampId)`. If the ramp has left its pre-start phase, update the UI from that status and do not submit start again. If status still shows the ramp waiting to start, retain the payment screen and offer a controlled retry. This prevents a successful first request from being presented as a failed payment or followed by a conflicting duplicate request.

## Poll Without Overlap

Use polling for active user-facing screens and webhooks for durable reconciliation. A UI poller should:

- schedule its next poll only after the current request or batch finishes;
- isolate per-ramp failures so one failed status request does not discard successful updates for other ramps;
- stop when the view closes, the component unmounts, or all tracked ramps are terminal; and
- apply only responses that still belong to the active view and ramp set.

Do not treat a fixed polling interval as part of the Vortex contract. Choose it for the UI's freshness needs, back off during repeated failures, and avoid opening one unbounded polling loop per history item. See [Webhooks](https://api-docs.vortexfinance.co/webhooks) for server-side lifecycle events.

## Before Shipping

Exercise these cases in sandbox, not only the happy path:

- a slow quote response arriving after a newer quote;
- quote or payment-instruction expiry while the screen is open;
- a page reload during the payment handoff;
- concurrent API calls during token refresh;
- a wallet connected to the wrong network;
- a successful start whose HTTP response is lost; and
- one failed status request in a batch of successful polls.

Complete the broader [Production Checklist](https://api-docs.vortexfinance.co/production-checklist) before going live.

---
