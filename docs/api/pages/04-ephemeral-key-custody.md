# 4. Ephemeral Key Custody

Ephemeral accounts are temporary blockchain accounts created for a single ramp. They may hold funds in transit while Vortex coordinates swaps, transfers, bridge operations, or payment settlement.

Vortex receives only ephemeral public addresses. Vortex does not receive, store, log, or reconstruct ephemeral secret keys.

This is a critical integration responsibility:

- The API client or SDK environment must store ephemeral secrets securely.
- Secrets must remain available until the ramp is complete and any recovery window has passed.
- Secrets must never be sent to Vortex endpoints, support channels, logs, analytics, or browser-visible code.
- If ephemeral secrets are lost, Vortex may be unable to complete recovery or move funds on behalf of the user.

The SDK can store local backups using `storeEphemeralKeys`, which defaults to `true`. In Node.js environments, these backups are written as local files keyed by ramp ID.

Treat those backup files as sensitive key material. Encrypt them at rest in production, restrict filesystem permissions, exclude them from source control, and define a retention policy that matches your operational recovery needs.

Direct API integrations must implement equivalent custody behavior. At minimum, they should create fresh ephemerals per ramp, store encrypted backups, associate backups with the ramp ID, and verify that recovery material exists before allowing the user to continue.

---
