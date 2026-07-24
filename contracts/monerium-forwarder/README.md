# Monerium B2B Onramp Forwarder

Foundry project for the attestor-linked forwarder (Monerium B2B zero-touch onramp):
per-client EIP-1167 clones whose EIP-1271 `isValidSignature` accepts only the fixed
Monerium link message from the Vortex attestor, with an immutable EURe→EURC→USDC
conversion policy and client-controlled recovery.

- Spec: [docs/prd/monerium-b2b-implementation-plan.md](../../docs/prd/monerium-b2b-implementation-plan.md) §2
  and [docs/prd/monerium-eur-usdc-onramp-b2b-variant.md](../../docs/prd/monerium-eur-usdc-onramp-b2b-variant.md)
- All placeholder parameter values (slippage, delays, caps, fee) are tracked in
  [docs/prd/monerium-onramp-deferred-decisions.md](../../docs/prd/monerium-onramp-deferred-decisions.md) —
  do not treat values in code as final.

```bash
git submodule update --init  # once per clone: fetches lib/forge-std
forge build
forge test                   # unit tests (mocks)
ETH_RPC_URL=... forge test   # + mainnet fork tests (pending, task 2)
```

Linted by `forge fmt`/forge-lint, not Biome (the TypeScript in `script/` is Biome-governed).

## Config manifest (D3)

`script/generate-manifest.ts` emits a versioned JSON manifest for a factory deployment
(bytecode hashes, all immutables, per-clone config, deploy-tx provenance);
`script/verify-manifest.ts` re-checks every field against live chain state and exits
nonzero with a field-level diff on mismatch. Runnable by third parties from a repo
checkout (`bun install` once for viem):

```bash
bun script/generate-manifest.ts <factoryAddress> <rpcUrl> [outFile] [--logs-rpc <url>]
bun script/verify-manifest.ts <manifestFile> <rpcUrl> [--logs-rpc <url>]
```

`--logs-rpc`: many free public RPCs refuse historical `eth_getLogs` ("archive" gating);
pass a logs-capable endpoint for the ForwarderDeployed enumeration — all other reads,
including per-forwarder deploy provenance via transaction receipts, work on any full
node. Published manifests live in `manifests/`.

**The manifest is consistency evidence, NOT a trust root** (re-review R01): it is
produced by Vortex from the same chain state it attests to, so a verifier pass proves
only that the deployment has not silently changed since publication — not that it was
honest. Independent verification of contract behavior requires the verified source on a
block explorer. Client-authorized config changes (destination/fallback rotation by the
client's own fallbackAddress) are reported as expected transitions, not failures
(re-review R07).
