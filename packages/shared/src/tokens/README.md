# Token Configuration

This directory contains the token configuration for the Pendulum Pay (Vortex) application. It provides a structured and
modular approach to managing token information across different blockchain networks.

## Directory Structure

```
tokens/
├── README.md
├── index.ts                 # Main entry point that exports everything
├── constants/               # Shared constants
│   ├── networks.ts          # Network definitions
│   ├── pendulum.ts          # Pendulum-specific constants
│   └── misc.ts              # Miscellaneous constants
├── types/                   # Type definitions
│   ├── base.ts              # Base types shared across token types
│   ├── evm.ts               # EVM-specific types
│   ├── assethub.ts          # AssetHub-specific types
│   ├── stellar.ts           # Stellar-specific types
│   └── moonbeam.ts          # Moonbeam-specific types
├── evm/                     # EVM token configuration
│   └── config.ts            # EVM token details
├── assethub/                # AssetHub token configuration
│   └── config.ts            # AssetHub token details
├── stellar/                 # Stellar token configuration
│   └── config.ts            # Stellar token details
├── moonbeam/                # Moonbeam token configuration
│   └── config.ts            # Moonbeam token details
└── utils/                   # Utility functions
    ├── typeGuards.ts        # Type guards for token types
    └── helpers.ts           # Helper functions for token operations
```

## Usage

Import the token configuration from the main entry point:

```typescript
import {
  // Types
  TokenType,
  EvmToken,
  FiatToken,

  // Token Details
  EvmTokenDetails,
  AssetHubTokenDetails,
  StellarTokenDetails,
  MoonbeamTokenDetails,

  // Configurations
  evmTokenConfig,
  assetHubTokenConfig,
  stellarTokenConfig,
  moonbeamTokenConfig,

  // Utility Functions
  getOnChainTokenDetails,
  getAnyFiatTokenDetails,
  isEvmToken,
  isStellarToken,

  // Constants
  Networks,
  PENDULUM_USDC_AXL,
  HORIZON_URL,
} from 'signer-service/src/config/tokens';
```

## Examples

### Get token details for a specific network and token

```typescript
import { getOnChainTokenDetails, Networks, EvmToken } from 'signer-service/src/config/tokens';

const usdcDetails = getOnChainTokenDetails(Networks.Polygon, EvmToken.USDC);
console.log(usdcDetails.erc20AddressSourceChain); // '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
```

### Get fiat token details

```typescript
import { getAnyFiatTokenDetails, FiatToken } from 'signer-service/src/config/tokens';

const eurcDetails = getAnyFiatTokenDetails(FiatToken.EURC);
console.log(eurcDetails.fiat.name); // 'Euro'
```

### Check token type

```typescript
import { isEvmToken, getOnChainTokenDetails, Networks, EvmToken } from 'signer-service/src/config/tokens';

const tokenDetails = getOnChainTokenDetails(Networks.Polygon, EvmToken.USDC);
if (isEvmToken(tokenDetails)) {
  console.log(tokenDetails.erc20AddressSourceChain);
}
```

## Extending

To add a new token type:

1. Create a new type definition in `types/`
2. Add the token type to the `TokenType` enum in `types/base.ts`
3. Create a new configuration file in a dedicated directory
4. Add type guards in `utils/typeGuards.ts`
5. Add helper functions in `utils/helpers.ts`
6. Export everything in `index.ts`
