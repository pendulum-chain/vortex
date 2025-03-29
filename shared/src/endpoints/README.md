# API Endpoint Type Declarations

This directory contains TypeScript type declarations for the API endpoints in the Pendulum Pay backend. These types are shared between the frontend and backend to ensure type safety and consistency.

## Structure

Each file in this directory corresponds to a specific domain of the API and contains type declarations for the request and response objects of the endpoints in that domain:

- `brla.endpoints.ts`: BRLA-related endpoints
- `email.endpoints.ts`: Email storage endpoints
- `moonbeam.endpoints.ts`: Moonbeam-related endpoints
- `pendulum.endpoints.ts`: Pendulum-related endpoints
- `price.endpoints.ts`: Price-related endpoints
- `quote.endpoints.ts`: Quote-related endpoints
- `ramp.endpoints.ts`: Ramp-related endpoints
- `rating.endpoints.ts`: Rating storage endpoints
- `siwe.endpoints.ts`: Sign-In with Ethereum endpoints
- `stellar.endpoints.ts`: Stellar-related endpoints
- `storage.endpoints.ts`: Storage-related endpoints
- `subsidize.endpoints.ts`: Subsidize-related endpoints

## Usage

### Backend

In the backend, you can use these types to ensure that your controllers and services are handling the correct request and response types:

```typescript
import { Request, Response } from 'express';
import { BrlaEndpoints } from 'shared';

export const getBrlaUser = async (
  req: Request<{}, {}, {}, BrlaEndpoints.GetUserRequest>,
  res: Response<BrlaEndpoints.GetUserResponse>
): Promise<void> => {
  // Implementation
};
```

### Frontend

In the frontend, you can use these types to ensure that your API calls are sending the correct request data and handling the response data correctly:

```typescript
import { BrlaEndpoints } from 'shared';
import { apiRequest } from './api-client';

export class BrlaService {
  static async getUser(taxId: string): Promise<BrlaEndpoints.GetUserResponse> {
    return apiRequest<BrlaEndpoints.GetUserResponse>('get', '/brla/getUser', undefined, {
      params: { taxId },
    });
  }
}
```

## Type Declarations

Each endpoint has its own request and response type declarations. For example, the BRLA endpoints have the following types:

```typescript
export namespace BrlaEndpoints {
  // GET /brla/getUser?taxId=:taxId
  export interface GetUserRequest {
    taxId: string;
  }

  export interface GetUserResponse {
    evmAddress: string;
  }

  // Other endpoint types...
}
```

## Benefits

Using these shared type declarations provides several benefits:

1. **Type Safety**: Ensures that the frontend and backend are using the same types for API requests and responses.
2. **Documentation**: Serves as documentation for the API endpoints.
3. **Refactoring**: Makes it easier to refactor the API by updating the types in one place.
4. **Code Completion**: Provides code completion in IDEs for API requests and responses.
5. **Error Prevention**: Helps prevent errors by catching type mismatches at compile time.
