# API Services

This directory contains type-safe service classes for interacting with the backend API endpoints. Each service corresponds to a specific domain of the API and provides methods for making requests to the endpoints.

## Structure

- `api-client.ts`: Base API client with error handling and request/response interceptors
- Service files for each domain:
  - `brla.service.ts`: BRLA-related endpoints
  - `email.service.ts`: Email storage endpoints
  - `moonbeam.service.ts`: Moonbeam-related endpoints
  - `pendulum.service.ts`: Pendulum-related endpoints
  - `price.service.ts`: Price-related endpoints
  - `quote.service.ts`: Quote-related endpoints
  - `ramp.service.ts`: Ramp-related endpoints
  - `rating.service.ts`: Rating storage endpoints
  - `siwe.service.ts`: Sign-In with Ethereum endpoints
  - `stellar.service.ts`: Stellar-related endpoints
  - `storage.service.ts`: Storage-related endpoints
  - `subsidize.service.ts`: Subsidize-related endpoints

## Usage

Import the service you need and call its methods:

```typescript
import { BrlaService } from 'services/api';

// Example: Get a user's information
const getUserInfo = async (taxId: string) => {
  try {
    const response = await BrlaService.getUser(taxId);
    console.log('User EVM address:', response.evmAddress);
  } catch (error) {
    console.error('Failed to get user info:', error);
  }
};
```

## Type Safety

All services use TypeScript interfaces from the `shared` module to ensure type safety between the frontend and backend. The request and response types are defined in the `shared/src/endpoints` directory.

## Error Handling

The base API client includes error handling that formats error messages from the backend. You can also use the `handleApiError` function for custom error handling:

```typescript
import { handleApiError } from 'services/api';

try {
  // Make API request
} catch (error) {
  const errorMessage = handleApiError(error, 'Default error message');
  console.error(errorMessage);
}
```

## Migrating from Legacy Code

The legacy API functions in `services/backend.ts` are now deprecated and will be removed in a future release. Use the new service classes instead.

Legacy code:
```typescript
import { requestRampQuote } from 'services/backend';

const quote = await requestRampQuote({
  rampType: 'on',
  from: 'fiat',
  to: 'blockchain',
  inputAmount: '100',
  inputCurrency: 'brl',
  outputCurrency: 'usdc',
});
```

New code:
```typescript
import { QuoteService } from 'services/api';

const quote = await QuoteService.createQuote(
  'on',
  'fiat',
  'blockchain',
  '100',
  'brl',
  'usdc'
);
