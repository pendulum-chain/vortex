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
forge build
forge test                   # unit tests (mocks)
ETH_RPC_URL=... forge test   # + mainnet fork tests (pending, task 2)
```

Linted by `forge fmt`/forge-lint, not Biome.
