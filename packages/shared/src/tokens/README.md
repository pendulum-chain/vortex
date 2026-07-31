# Token Configuration

This module is the shared source for fiat and on-chain token metadata used by every
workspace.

## Layout

- `tokenConfig.ts` and `index.ts` expose the public token API.
- `types/` defines token detail shapes for EVM, Pendulum, Moonbeam, and AssetHub.
- `evm/`, `pendulum/`, `moonbeam/`, `assethub/`, and `freeTokens/` contain network
  configuration.
- `utils/` contains lookup, normalization, and type-guard functions.

Import through the package boundary:

```ts
import { EvmToken, FiatToken, Networks, getAnyFiatTokenDetails, getOnChainTokenDetails } from "@vortexfi/shared";
```

Do not import this directory through an app-relative path.

## Changing tokens

When adding or removing a token:

1. Update the relevant enum and detail type.
2. Add or remove every supported network configuration and address.
3. Update normalization and type guards when the new value changes their exhaustiveness.
4. Check all `Record<FiatToken, ...>` values. `FiatToken` currently contains `EURC`,
   `ARS`, `BRL`, `USD`, `MXN`, and `COP`.
5. Add or update lookup/configuration tests.
6. From the repository root, run `bun build:shared`, then test/typecheck the consumers.

Chain addresses, decimals, payment rails, and `supportsRamp` flags are runtime behavior;
review them with the matching security spec when they affect a live corridor.
