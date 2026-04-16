# Alfredpay Onramp Flow — USD, MXN, COP

## Phase Sequence

```
USER INITIATES ONRAMP
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND: KYC + Account Registration                       │
│                                                             │
│  USD ──► iFrame redirect KYC link                          │
│  MXN ──► API form submission + document upload             │
│  COP ──► API form submission + document upload             │
│                                                             │
│  Creates alfredpayUserId + alfredpayTransactionId           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: initial                                           │
│  InitialPhaseHandler                                        │
│                                                             │
│  isAlfredpayToken(inputCurrency)?                          │
│    YES ──► next: alfredpayOnrampMint                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: alfredpayOnrampMint                               │
│  AlfredpayOnrampMintHandler · timeout: 5 min                │
│  Network: Polygon                                           │
│                                                             │
│  Parallel polls every 5 s:                                  │
│  ┌─────────────────────┐  ┌──────────────────────────────┐ │
│  │ USDC balance on     │  │ Alfredpay transaction status │ │
│  │ Polygon ephemeral   │  │  FAILED ──► phase: failed    │ │
│  │ address             │  │  ON_CHAIN_COMPLETED ──► save │ │
│  └──────────┬──────────┘  └──────────────────────────────┘ │
│             │ balance reached                               │
│             └──────────────────────────────────────────────┤
│                                          next: fundEphemeral│
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: fundEphemeral                                     │
│  FundEphemeralPhaseHandler · delay: 30 s                    │
│  Network: Polygon + destination EVM                         │
│                                                             │
│  Funds ephemeral accounts with native gas:                  │
│   • Polygon ephemeral (always for Alfredpay onramp)        │
│   • Destination EVM ephemeral (if dest ≠ AssetHub)         │
│   • Pendulum ephemeral: SKIPPED for Alfredpay              │
│                                                             │
│                                   next: squidRouterSwap     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
             ┌─────────────────────────┐
             │ dest = Polygon USDC?    │
             └──────────┬──────────────┘
          YES ◄──────────┤──────────► NO
          │              │            │
          ▼              │            ▼
┌──────────────┐         │  ┌─────────────────────────────────┐
│PHASE 4a:     │         │  │  PHASE 4b: squidRouterSwap      │
│destination   │         │  │  SquidRouterPhaseHandler        │
│Transfer      │         │  │  Network: Polygon               │
│(skip bridge) │         │  │                                 │
│              │         │  │  1. squidRouterApprove tx       │
│Transfer USDC │         │  │     (approve USDC for Squid)    │
│directly to   │         │  │  2. squidRouterSwap tx          │
│user on       │         │  │     (bridge USDC → dest token) │
│Polygon       │         │  │                                 │
│              │         │  │       next: squidRouterPay      │
└──────┬───────┘         │  └────────────────┬────────────────┘
       │                 │                   │
       │                 │                   ▼
       │                 │  ┌─────────────────────────────────┐
       │                 │  │  PHASE 5: squidRouterPay        │
       │                 │  │  SquidRouterPayPhaseHandler     │
       │                 │  │  initial delay: 60 s            │
       │                 │  │                                 │
       │                 │  │  Parallel:                      │
       │                 │  │  • Poll Axelar bridge every 10s │
       │                 │  │  • Monitor dest balance         │
       │                 │  │                                 │
       │                 │  │  On bridge executed:            │
       │                 │  │  • Calculate dest gas fee       │
       │                 │  │  • Pay Axelar gas service       │
       │                 │  │  • Create subsidy record        │
       │                 │  │                                 │
       │                 │  │  next:                          │
       │                 │  │  dest=AssetHub → moonbeamToPend │
       │                 │  │  dest=EVM → finalSettlementSub  │
       │                 │  └────────────────┬────────────────┘
       │                 │                   │
       │                 │                   ▼
       │                 │  ┌─────────────────────────────────┐
       │                 │  │  PHASE 6: finalSettlementSubsidy│
       │                 │  │  (EVM destinations)             │
       │                 │  └────────────────┬────────────────┘
       │                 │                   │
       └────────────────►│◄──────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  PHASE: complete    │
              │  Ramp finished ✓    │
              └─────────────────────┘
```

## Currency Differences

| | USD | MXN | COP |
|---|---|---|---|
| **Country** | US | MX | CO |
| **KYC type** | iFrame redirect | API form + doc upload | API form + doc upload |
| **Bank network** | ACH / BANK_USA | SPEI | COELSA |
| **Min amount** | $1 | $5,000 MXN | $1,000,000 COP |
| **Backend phases** | Identical | Identical | Identical |

## Key State Fields

| Field | Description |
|---|---|
| `alfredpayUserId` | Customer ID from Alfredpay |
| `alfredpayTransactionId` | Alfredpay onramp transaction ID |
| `alfredpayOnrampMintTxHash` | Hash of Alfredpay mint tx on Polygon |
| `evmEphemeralAddress` | Ephemeral account for receiving/transferring |
| `squidRouterApproveHash` | Hash of USDC approval tx |
| `squidRouterSwapHash` | Hash of bridge swap tx |
| `squidRouterPayTxHash` | Hash of Axelar gas service payment |
| `destinationTransferTxHash` | Hash of final destination transfer |
| `squidRouterQuoteId` | Quote ID for SquidRouter |
| `squidRouterReceiverId` | Receiver ID for SquidRouter |

## Quote Strategy Engines (in order)

1. `OnRampInitializeAlfredpayEngine` — initialize quote
2. `OnRampAlfredpayToEvmFeeEngine` — calculate fees
3. `OnRampSquidRouterUsdToEvmEngine` — SquidRouter bridge quote
4. `OnRampFinalizeEngine` — finalize quote
