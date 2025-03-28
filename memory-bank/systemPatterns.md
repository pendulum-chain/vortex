# System Patterns: Pendulum Pay Backend

## Core Architecture

```mermaid
graph TD
    F[Frontend] -->|API Calls| B[Backend]
    B -->|State Management| DB[(PostgreSQL)]
    B -->|Blockchain| EVM[EVM Chains]
    B -->|XCM| Substrate[Substrate Chains]
    B -->|Stellar SDK| Stellar
    B -->|Background Jobs| W[Worker]
```

## State Machine Implementation

### Ramp Process Flow
```mermaid
stateDiagram-v2
    [*] --> Initiated
    Initiated --> Quoted: Generate quote
    Quoted --> Preparing: Start ramp
    Preparing --> Funding: Create ephemeral account
    Funding --> Swapping: Execute cross-chain swap
    Swapping --> Completing: Finalize transfer
    Completing --> [*]: Cleanup
    state ErrorState {
        [*] --> Error
        Error --> [*]
    }
    Initiated --> ErrorState: Validation failed
    Quoted --> ErrorState: Quote expired
    Preparing --> ErrorState: Funding failed
    Funding --> ErrorState: XCM failed
    Swapping --> ErrorState: Swap failed
```

## Data Model

### RampState Schema
```typescript
interface RampState {
  id: string;
  type: 'onramp' | 'offramp';
  phase: 'init' | 'quoted' | 'executing' | 'completed';
  network: string;
  amountIn: string;
  amountOut: string;
  transactions: {
    fundingTx?: string;
    swapTx?: string;
    completionTx?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

## Security Patterns

1. **Pre-signed Transactions**:
```mermaid
sequenceDiagram
    Frontend->>Backend: Initiate with signed payload
    Backend->>Backend: Validate signature
    Backend->>Blockchain: Submit pre-signed tx
    Blockchain-->>Backend: Transaction receipt
    Backend->>Frontend: Status update
```

2. **Idempotency Flow**:
```mermaid
sequenceDiagram
    Client->>Backend: Request (with idempotency key)
    Backend->>DB: Check key existence
    alt Key exists
        Backend-->>Client: Return cached response
    else
        Backend->>DB: Store new key
        Backend->>Processing: Execute request
        Backend->>DB: Store result
        Backend-->>Client: Return result
    end
```

## Cross-Chain Execution

```mermaid
sequenceDiagram
    Participant F as Frontend
    Participant B as Backend
    Participant P as Pendulum
    Participant M as Moonbeam
    
    F->>B: Initiate cross-chain swap
    B->>P: Create ephemeral account
    P-->>B: Account details
    B->>M: Lock source assets
    M-->>B: Lock confirmation
    B->>P: Execute XCM transfer
    P-->>B: Transfer proof
    B->>F: Completion status
