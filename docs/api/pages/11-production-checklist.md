# 11. Production Checklist

Before going live, verify the following:

- Use the SDK unless you have a clear reason to integrate directly with the raw API.
- Store secret API keys only in trusted server-side environments.
- Never expose `sk_live_*` or `sk_test_*` keys in browser or mobile code.
- Store ephemeral account secrets securely until ramps complete and recovery is no longer needed.
- If using the SDK's default `storeEphemeralKeys: true`, run the SDK from a directory with restricted filesystem permissions, encrypt the backup file yourself, or set `storeEphemeralKeys: false` and implement secure storage.
- Persist `quoteId`, `rampId`, user/session ID, partner order ID, and webhook IDs.
- Handle quote expiry by creating fresh quotes.
- Use webhooks for transaction lifecycle events and verify every webhook signature against `GET /v1/public-key` using RSA-PSS with SHA-256.
- Poll `GET /v1/ramp/{id}` for user-facing status screens and `GET /v1/ramp/{id}/errors` for support tooling.
- Test failed, delayed, and retried ramp states in sandbox.
- Define a support process for users who close the app before a ramp finishes.
- Rotate partner keys if they are exposed or no longer needed.
- For BRL flows, confirm that your onboarding path produces an eligible user before starting the ramp.

Direct API integrations should also verify that their signing implementation only signs the transactions returned by Vortex for the current ramp and phase. Never sign arbitrary transaction payloads without validating their destination, amount, asset, network, and signer.
