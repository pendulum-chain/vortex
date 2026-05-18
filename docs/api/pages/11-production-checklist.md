# 11. Production Checklist

Before going live, verify the following:

- Use the SDK unless you have a clear reason to integrate directly with the raw API.
- Store secret API keys only in trusted server-side environments.
- Never expose `sk_live_*` or `sk_test_*` keys in browser or mobile code.
- Store ephemeral account secrets securely until ramps complete and recovery is no longer needed.
- Encrypt ephemeral-key backups at rest in production.
- Persist `quoteId`, `rampId`, user/session ID, partner order ID, and webhook IDs.
- Handle quote expiry by creating fresh quotes.
- Use webhooks for transaction lifecycle events and verify every webhook signature.
- Poll `GET /v1/ramp/{id}` for user-facing status screens.
- Test failed, delayed, and retried ramp states in sandbox.
- Define a support process for users who close the app before a ramp finishes.
- Rotate partner keys if they are exposed or no longer needed.

Direct API integrations should also verify that their signing implementation only signs the transactions returned by Vortex for the current ramp and phase. Never sign arbitrary transaction payloads without validating their destination, amount, asset, network, and signer.
