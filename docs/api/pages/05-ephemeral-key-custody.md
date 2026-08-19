# Ephemeral Key Custody

Ephemeral accounts are temporary blockchain accounts created for a single ramp. The SDK creates a fresh Substrate (sr25519) account and a fresh EVM (secp256k1) account per ramp; one of each covers every leg of the route. They may hold funds in transit while Vortex coordinates swaps, transfers, bridge operations, or payment settlement.

Vortex receives only ephemeral public addresses. Vortex does not receive, store, log, or reconstruct ephemeral secret keys.

This is a critical integration responsibility:

- The API client or SDK environment must store ephemeral secrets securely.
- Secrets must remain available until the ramp is complete and any recovery window has passed.
- Secrets must never be sent to Vortex endpoints, support channels, logs, or analytics. In a browser SDK integration they necessarily exist in browser-visible memory and, by default, same-origin localStorage.
- If ephemeral secrets are lost, the partner may be unable to complete recovery for that ramp. Vortex has chain-specific cleanup mechanisms that can recover funds in some cases, but partners should not rely on this for normal operation.

The SDK can store local backups using `storeEphemeralKeys`, which defaults to `true`. In Node.js environments, it writes `ephemerals_{rampId}.json` to the process's current working directory. In browsers, it writes the same plaintext JSON under that key in same-origin localStorage. Neither form is encrypted at rest, and the storage location is not configurable in the current release.

Treat those backups as sensitive key material. Restrict Node filesystem permissions, exclude files from source control, and define a retention policy that matches operational recovery needs. Browser localStorage is prototype-grade: every same-origin script can read it, and the SDK does not prune terminal entries automatically. Setting `storeEphemeralKeys: false` disables the SDK backup; the current SDK does not expose a replacement storage adapter.

Direct API integrations must implement equivalent custody behavior. At minimum, they should create fresh ephemerals per ramp, store encrypted backups, associate backups with the ramp ID, and verify that recovery material exists before allowing the user to continue.

---
