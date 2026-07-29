# Ramp Machine + Widget Card Flow

This document maps how the top-level XState machine (`ramp.machine.ts`) drives what the widget renders, and which UI actions send events back into the machine.

## Source of truth
- Machine: `apps/frontend/src/machines/ramp.machine.ts`
- KYC node: `apps/frontend/src/machines/kyc.states.ts`
- Widget rendering switch: `apps/frontend/src/pages/widget/index.tsx`
- URL/bootstrap events: `apps/frontend/src/hooks/useRampUrlParams.ts`
- Main CTA behavior: `apps/frontend/src/components/RampSubmitButton/RampSubmitButton.tsx`

## High-level flow (machine)
```mermaid
flowchart TD
  A[Idle] -->|SET_QUOTE| B[LoadingQuote]
  B -->|quote loaded + unauth + enteredViaForm| AA[CheckAuth]
  B -->|quote loaded otherwise| C[QuoteReady]
  C -->|CONFIRM| D[RampRequested]

  D -->|kycNeeded = true| E[KYC]
  D -->|kycNeeded = false and BRL| F[KycComplete]

  E -->|child KYC done| F
  E -->|child KYC error| X[KycFailure]
  X --> R[Resetting]

  F -->|PROCEED_TO_REGISTRATION + authenticated| G[RegisterRamp]
  F -->|PROCEED_TO_REGISTRATION + unauthenticated| AA[CheckAuth]
  F -->|GO_BACK| C

  G --> H[UpdateRamp]

  H -->|SELL onDone| I[StartRamp]
  H -->|BUY onDone| H
  H -->|PAYMENT_CONFIRMED 'BUY'| I

  I -->|callbackUrl present| J[RedirectCallback]
  I -->|no callbackUrl| K[RampFollowUp]

  K -->|FINISH_OFFRAMPING| R
  J -->|after 5s + cleanup| A

  C -->|GO_BACK| A
  A -->|INITIAL_QUOTE_FETCH_FAILED| Q[InitialFetchFailed]

  R -->|urlCleaner done| A

  AA -->|authenticated + postAuthTarget=RegisterRamp| G
  AA -->|authenticated + postAuthTarget=EmbeddedWallet| EW[EmbeddedWallet]
  AA -->|authenticated + postAuthTarget=QuoteReady| C
  AA -->|authenticated| C
  AA -->|not authenticated| AB[EnterEmail]
  AB --> AC[CheckingEmail]
  AC --> AD[RequestingOTP]
  AD --> AE[EnterOTP]
  AE --> AF[VerifyingOTP]
  AF -->|success + postAuthTarget=RegisterRamp| G
  AF -->|success + postAuthTarget=EmbeddedWallet| EW
  AF -->|success otherwise| C
  AF -->|error| AE

  A -->|REQUEST_EMBEDDED_WALLET| AA
  EW -->|EMBEDDED_WALLET_READY| A
  EW -->|EMBEDDED_WALLET_FAILED| Z

  G -->|error| Z[Error]
  H -->|error| Z
  I -->|error| Z
```

## Widget card resolution order (important)
`WidgetContent` picks the first matching branch in this order:

1. `ErrorStep` if machine matches `Error`
2. `RampFollowUpRedirectStep` if machine matches `RedirectCallback`
3. Loading card for `EmbeddedWallet`
4. `AuthEmailStep` for `CheckAuth | EnterEmail | CheckingEmail | RequestingOTP`
5. `AuthOTPStep` for `EnterOTP | VerifyingOTP`
6. `MoneriumRedirectStep` if Monerium child actor exists and child state is `Redirect`
7. `SummaryStep` for `KycComplete | RegisterRamp | UpdateRamp | StartRamp`
8. Avenia branch if Avenia child actor exists:
   - `AveniaKYBFlow` when CNPJ + `kybUrls` present
   - else `AveniaKYBForm` (CNPJ)
   - else `AveniaKYCForm` (CPF)
9. `InitialQuoteFailedStep` for `InitialFetchFailed`
10. fallback: `DetailsStep`

## KYC subflow and cards
```mermaid
flowchart TD
  KYC[KYC.Deciding] -->|fiat = BRL| AV[Avenia child machine]
  KYC -->|fiat = EURC and BUY| MO[Monerium child machine]
  KYC -->|otherwise| ST[Stellar child machine]

  AV -->|done without error| VC[VerificationComplete]
  MO -->|done with authToken| VC
  ST -->|done with paymentData| VC

  VC --> KC[KycComplete]

  AV -->|error| KF[KycFailure]
  MO -->|error| KF
  ST -->|error| KF

  MO -. child state Redirect .-> MR[MoneriumRedirectStep card]

  AV -. child exists .-> AC[Avenia cards]
  AC --> AKYC[AveniaKYCForm]
  AC --> AKYB[AveniaKYBForm]
  AC --> AKYBF[AveniaKYBFlow]
```

## State-to-card map
| Machine state / condition | Card shown |
|---|---|
| `Error` | `ErrorStep` |
| `RedirectCallback` | `RampFollowUpRedirectStep` |
| `EmbeddedWallet` | Loading card while the authenticated CDP wallet is created and server-verified |
| `CheckAuth`, `EnterEmail`, `CheckingEmail`, `RequestingOTP` | `AuthEmailStep` |
| `EnterOTP`, `VerifyingOTP` | `AuthOTPStep` |
| Monerium child actor state `Redirect` | `MoneriumRedirectStep` |
| `KycComplete`, `RegisterRamp`, `UpdateRamp`, `StartRamp` | `SummaryStep` |
| Avenia actor exists + CNPJ + `kybUrls` | `AveniaKYBFlow` |
| Avenia actor exists + CNPJ (no `kybUrls`) | `AveniaKYBForm` |
| Avenia actor exists + CPF | `AveniaKYCForm` |
| `InitialFetchFailed` | `InitialQuoteFailedStep` |
| everything else | `DetailsStep` |

## Key UI -> machine events
- `DetailsStep` submit -> `CONFIRM` (via `useRampSubmission`) and `SET_ADDRESS`
- `RampSubmitButton`:
  - in `QuoteReady` -> `CONFIRM`
  - in `KycComplete` -> `PROCEED_TO_REGISTRATION`
  - default -> `SummaryConfirm`
  - in `UpdateRamp` on onramp -> `PAYMENT_CONFIRMED`
  - if quote expired -> `RESET_RAMP`
- `AuthEmailStep` -> `ENTER_EMAIL`
- `AuthOTPStep` -> `VERIFY_OTP`
- `EVMWalletButton` embedded option -> `REQUEST_EMBEDDED_WALLET`
- CDP wallet registration success -> `EMBEDDED_WALLET_READY`
- CDP authentication, creation, or registration failure -> `EMBEDDED_WALLET_FAILED`
- Error/initial-failure/retry actions -> `RESET_RAMP`
- Back button (`StepBackButton`) primarily sends `GO_BACK` (with Avenia-specific child events in document/liveness/KYB sub-steps)

## URL/bootstrap interactions
`useSetRampUrlParams` seeds machine state at widget load:
- `SET_QUOTE_PARAMS`
- `SET_EXTERNAL_ID` (if provided)
- `SET_QUOTE` (provided quoteId or fetched quote)
- `INITIAL_QUOTE_FETCH_FAILED` on quote fetch failure

This is why many sessions start in `LoadingQuote`/`QuoteReady` rather than plain `Idle`.

## Auth gating change
- The initial `Idle -> CheckAuth` auto-transition was removed.
- For `/widget` entry coming from Quote form (`enteredViaForm`), auth can happen directly after `LoadingQuote` and before `QuoteReady`.
- Auth is also deferred to `KycComplete -> PROCEED_TO_REGISTRATION` when needed.
- `postAuthTarget` tracks whether post-auth continuation should be `QuoteReady` or `RegisterRamp`.
- `postAuthTarget=EmbeddedWallet` preserves the explicit embedded-wallet request across OTP and continues to the
  provisioning state only after authentication.
- `GO_BACK` behavior in auth states:
  - `CheckAuth`, `EnterEmail`, `CheckingEmail`, `RequestingOTP`: back to `KycComplete` when `postAuthTarget=RegisterRamp`, otherwise reset to `Idle` (Quote form path).
  - `EnterOTP`, `VerifyingOTP`: back to `EnterEmail`.

## Optional wallet selection

- External Reown/Wagmi remains available and does not initialize CDP.
- The embedded option is shown only when both the base and provisioning flags are enabled.
- `EmbeddedWallet` is entered only after the user explicitly chooses that option.
- Successful creation is not enough: the API verifies ownership and persists the wallet before
  `EMBEDDED_WALLET_READY`.
- CDP supports only the EVM branch. AssetHub and other Polkadot paths keep their existing connection/signing logic.
- In an iframe, the embedded option is available only for an exact allowed parent origin. Unknown ancestry fails
  closed and leaves the existing-wallet flow available.

## Practical reading model
When debugging what card should show, check in this order:
1. Top-level ramp state (`rampActor.getSnapshot().value`)
2. Whether Monerium child is in `Redirect`
3. Whether Avenia child exists and its context (`taxId`, `kybUrls`, `kybStep`)
4. Whether auth gating states (`CheckAuth`...`VerifyingOTP`) currently match

The render priority order can override expectations from raw machine state (for example, a Monerium `Redirect` child card can appear before generic details/some other fallback views).
