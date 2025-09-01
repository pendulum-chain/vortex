
## Overview

The Vortex SDK abstracts Vortex's API and ephemeral key handling into a self-contained package. It provides a clean interface for creating quotes, registering ramps, and managing the signing process for cross-chain transactions.

## Core Components

### VortexSdk (Main Orchestrator)

The `VortexSdk` class is the main entry point that users interact with. It bundles together:

- **ApiService**: Handles all backend API interactions
- **NetworkManager**: Manages RPC connections for transaction signing
- **RampHandlers**: Business logic for different ramp types (e.g., BrlaHandler)

Key responsibilities:
- Automatic initialization of network connections
- Ephemeral key generation for multiple networks
- Transaction signing coordination
- API request orchestration

### Ramp Handler Pattern

Any class that implements `RampHandler` abstracts the business logic required to start a ramp. The current implementation includes:

- **BrlaHandler**: Handles Brazilian Real (BRLA) onramp operations

#### Ramp Flow

From the user's perspective, ramp operations follow a consistent pattern:

1. **Register**: Mandatory call to register a ramp with the backend
2. **Update**: Optional intermediate steps (if transaction hashes are needed)
3. **Start**: Mandatory call to initiate the actual ramp process

The `update` call to create pre-signed transactions happens automatically in the background and does not require user interaction. This logic must be implemented by the `Handler` for the specific flow.

### Service Layer

#### ApiService
- Provides abstraction for all backend interactions
- Handles error parsing and transformation
- Manages HTTP requests and responses

#### NetworkManager
- Handles configuration and connection with RPC nodes
- Required for signing pre-signed transactions
- Manages WebSocket connections to blockchain networks

## Stateless Design

- No ramp state is stored in memory
- Users are responsible for persisting ramp IDs and managing state
- Each operation is independent and can be called without prior context
- Ephemeral keys are generated on-demand and passed explicitly to signing operations
- Ephemeral keys are essentially "discarded" after the ramp is registered
