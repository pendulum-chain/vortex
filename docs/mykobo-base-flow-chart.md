# Mykobo + EURC-on-Base — Flow Charts

Companion to `mykobo-base-flow.md`. Diagrams render via Mermaid.

---

## Legend

| Symbol | Meaning |
|---|---|
| `User` | End user (browser + bank account + EVM wallet on Base) |
| `FE` | Frontend (`apps/frontend`) — React + XState |
| `API` | Backend (`apps/api`) — Express + Sequelize |
| `Phases` | Phase orchestrator + handlers (`apps/api/.../phases`) |
| `Mykobo` | Mykobo API (`api.mykobo.co` / sandbox) — KYC + EURC settlement |
| `Base` | Base / BaseSepolia EVM chain |
| `Squid` | Squidrouter (cross-chain swap aggregator) |
| `Dest` | Destination EVM chain (e.g. Arbitrum, Polygon) |
| `Eph` | Backend-controlled EVM ephemeral (transient wallet for this ramp) |
| `MykoboWallet` | User's EVM wallet on Base where Mykobo mints EURC |
| `Settlement` | `MYKOBO_SETTLEMENT_ADDRESS` (Mykobo's collector on Base) |

---

## 1. BUY (Onramp) — Fiat → EURC on Base → destination token

### 1.1 High-level sequence

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant FE as Frontend
    participant API as Backend API
    participant Mykobo
    participant Phases as Phase Orchestrator
    participant Base as Base Chain
    participant Squid as Squidrouter
    participant Dest as Destination Chain

    Note over User,FE: 1. KYC
    User->>FE: Open widget, pick EUR → token on EVM (Base/other)
    FE->>Mykobo: GET /profiles?address=walletAddress
    alt no profile
        FE->>User: MykoboKycForm (text + 4 files)
        User->>FE: Submit KYC
        FE->>API: POST /v1/mykobo/profiles (multipart)
        API->>Mykobo: POST /profiles
    end
    loop every 5s, up to 20min
        FE->>Mykobo: GET /profiles?address=...
        Mykobo-->>FE: { reviewStatus }
    end
    Note over FE: reviewStatus = approved

    Note over User,API: 2. Quote + Register
    FE->>API: POST /v1/ramp/quotes (EUR→token, to=base/EVM)
    API-->>FE: quote (Mykobo strategy)
    FE->>API: POST /v1/ramp/register {walletAddress, destinationAddress}
    API->>Mykobo: getDepositInstructions(walletAddress)
    Mykobo-->>API: { iban, bic, receiverName, reference }
    API->>API: prepareMykoboOnrampTransactions
    API-->>FE: { unsignedTxs, ibanPaymentData, stateMeta }

    Note over User,FE: 3. User signs + pays
    FE->>User: EUROnrampDetails (IBAN + reference)
    FE->>User: Sign presigned transferFrom + EIP-2612 permit
    User->>FE: Signatures (mykoboOnrampPermit)
    FE->>API: updateRamp { mykoboOnrampPermit }
    User->>User: SEPA transfer to Mykobo IBAN
    User->>FE: "I have made the payment" → PAYMENT_CONFIRMED

    Note over Mykobo,Base: 4. Settlement
    Mykobo->>Base: Mint EURC → MykoboWallet (user's address)

    Note over Phases,Dest: 5. On-chain orchestration
    loop mykoboOnrampDeposit (≤30min)
        Phases->>Base: balanceOf(EURC, MykoboWallet)
    end
    Phases->>Phases: 30s settle delay
    Phases->>Base: permit(owner=MykoboWallet, spender=Eph) [if needed]
    Phases->>Base: transferFrom(MykoboWallet → Eph)
    Phases->>Base: approve(EURC → Squidrouter)
    Phases->>Squid: swap(Base EURC → Dest token)
    Squid->>Dest: lands token (or bridged USDC fallback)
    alt backup route triggered
        Phases->>Dest: backupApprove + backupSwap
    end
    Phases->>Dest: destinationTransfer(Eph → user)
    Phases-->>FE: phase = complete
```

### 1.2 Transaction graph on Base ephemeral

```mermaid
flowchart LR
    subgraph Base[Base chain]
        MW[Mykobo Wallet<br/>user EVM addr]
        E[Ephemeral<br/>backend-controlled]
        SQ[Squidrouter contract]
    end
    subgraph Dest[Destination chain]
        SQD[Squidrouter dest]
        OUT[Output token]
        UW[User wallet]
    end

    MW -- 1 transferFrom<br/>via presigned permit --> E
    E  -- 2 approve EURC --> SQ
    E  -- 3 swap --> SQ
    SQ -- bridge --> SQD
    SQD -- output --> OUT
    OUT -- 4 destinationTransfer --> UW

    SQD -. bridged USDC fallback .-> BK[Backup approve+swap<br/>by funding account]
    BK --> OUT
```

### 1.3 Phase state machine (backend)

```mermaid
stateDiagram-v2
    [*] --> initial
    initial --> mykoboOnrampDeposit: register + sign
    mykoboOnrampDeposit --> mykoboOnrampDeposit: balance not yet seen<br/>(check timeout, retry)
    mykoboOnrampDeposit --> failed: 30min payment timeout
    mykoboOnrampDeposit --> mykoboOnrampTransfer: EURC observed + 30s settle
    mykoboOnrampTransfer --> mykoboOnrampTransfer: recoverable error retry
    mykoboOnrampTransfer --> squidRouterSwap: permit + transferFrom done<br/>(or recovery shortcut)
    squidRouterSwap --> destinationTransfer
    destinationTransfer --> complete
    complete --> [*]
    failed --> [*]
```

### 1.4 KYC machine (frontend — `mykoboKyc.machine.ts`)

```mermaid
stateDiagram-v2
    [*] --> CheckingProfile
    CheckingProfile --> Done: approved
    CheckingProfile --> Verifying: pending
    CheckingProfile --> FormFilling: 404 (no profile)
    FormFilling --> Submitting: SubmitKycForm
    FormFilling --> Failure: CANCEL (UserRejected)
    Submitting --> Verifying
    Verifying --> Done: approved
    Verifying --> Rejected: rejected
    Verifying --> Failure: 4xx / timeout
    Done --> [*]
    Rejected --> [*]
    Failure --> [*]

    note right of Verifying
      Poll /profiles every 5s,
      20 min cap,
      AbortSignal-aware sleep
    end note
```

---

## 2. SELL (Offramp) — token on Base → EURC on Base → SEPA payout

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant FE as Frontend
    participant API as Backend API
    participant Base as Base Chain
    participant Squid as Squidrouter
    participant Mykobo

    User->>FE: Pick token on Base → EUR
    FE->>API: POST /v1/ramp/quotes (Base token → EUR)
    API-->>FE: quote (Mykobo offramp strategy)
    FE->>User: Connect Base wallet, confirm
    FE->>API: POST /v1/ramp/register {walletAddress}
    API->>API: prepareEvmToMykoboOfframpTransactions

    alt input is EURC on Base
        API-->>FE: 1 tx: ERC20.transfer(EURC, Settlement)
    else input is any other Base ERC-20
        API-->>FE: 2 txs: approve(Squid) + swap(token → EURC, to=Settlement)
    end

    FE->>User: Sign tx(s)
    User->>Base: Broadcast
    alt swap path
        Base->>Squid: swap any → EURC
        Squid->>Base: EURC → Settlement
    else direct path
        Base->>Base: EURC transfer → Settlement
    end

    Mykobo->>Base: Observe EURC receipt at Settlement
    Mykobo->>User: SEPA payout to linked bank
```

---

## 3. Routing decision (BUY vs SELL, Mykobo vs Monerium)

```mermaid
flowchart TD
    Q[Incoming quote] --> D{direction?}
    D -->|BUY| B{inputCurrency = EURC<br/>AND isBaseEvmNetwork(quote.to)?}
    D -->|SELL| S{outputCurrency = EURC<br/>AND isBaseEvmNetwork(quote.from)?}
    B -->|yes| BM[Mykobo onramp strategy]
    B -->|no| BO[Monerium / other]
    S -->|yes| SM[Mykobo offramp strategy]
    S -->|no| SO[Monerium / other<br/>requires moneriumAuthToken]
```

---

## 4. SANDBOX_ENABLED switching

```mermaid
flowchart LR
    Env[SANDBOX_ENABLED] -->|true| Sandbox
    Env -->|false| Prod
    subgraph Sandbox
        S1[api.sandbox.mykobo.co]
        S2[MYKOBO_BASE_NETWORK = BaseSepolia]
        S3[EURC = BaseSepolia EURC]
    end
    subgraph Prod
        P1[api.mykobo.co]
        P2[MYKOBO_BASE_NETWORK = Base]
        P3[EURC = ERC20_EURC_BASE 0x60a3...b42]
    end
```