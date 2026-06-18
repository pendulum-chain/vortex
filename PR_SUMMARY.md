# Quote-less KYB deep link with region selector

Adds a partner-facing deep link that takes business users straight into KYB verification - no quote required. Partners can send their users to the widget with a single URL and have them complete business verification for any supported region.

## Flow

```
?kyb / ?kybLocked → email/OTP auth → region selector → provider KYB → success screen
```

- **Brazil** → Avenia KYB. The company name and CNPJ are collected **together on a single company form** (no separate CNPJ card). The CNPJ field is editable in the deep-link flow and validated as **CNPJ-only** (KYB is business-only); in the normal quoted flow it stays read-only and pre-filled from the quote.
- **Mexico / Colombia / USA** → Alfredpay business KYB (the business customer type is preselected). MX/CO business deep links are routed to the company KYB form, not the individual KYC form.
- **Europe / Mykobo** is intentionally excluded (individual KYC only, requires a connected wallet).
- After success, the user lands on a **"KYB Completed"** screen; *Continue* resets to the standard quote form with the session still authenticated and the deep-link params stripped from the URL.

## URL parameters

| URL | Behavior |
|---|---|
| `?kyb` | KYB mode, region selector shown |
| `?kyb=BR` \| `MX` \| `CO` \| `US` | Selector shown with the region preselected (user can change it) |
| `?kybLocked=BR` \| `MX` \| `CO` \| `US` | Selector skipped, region pinned, back navigation disabled |
| `?kybLocked=BR` (specifically) | Additionally defaults the widget locale to `pt-BR` (an explicit locale in the path still wins, e.g. `/en/widget?kybLocked=BR`) |
| unknown / empty region code (e.g. `?kybLocked=ZZ`, bare `?kybLocked`) | Degrades gracefully to the **open selector** - the region is **not** treated as locked |

> Query keys are case-sensitive per the W3C/RFC URL spec: the parameter is `kybLocked` (lowercase `k`). A re-cased `KybLocked` is a different key and is ignored.

`externalSessionId`, `partnerId`, and `apiKey` are forwarded in KYB mode, so partner/session attribution works the same as in the quoted flow.

## Implementation notes

- **`kybLink` context object** - all KYB deep-link state (`fiatToken`, `regionLocked`) lives in a single optional context object whose *presence* enables the mode. It is registered in `initialRampContext`, so `RESET_RAMP` fully exits KYB mode.
- **New machine states** - `SelectRegion` (region picker, auto-skipped when locked and resolved to a fiat token), `KybLinkComplete` (terminal success screen), and `PostAuthRouting` (a transient state that routes a successful login - token check or OTP - to the destination recorded in `postAuthTarget`, replacing the duplicated transition branches in `CheckAuth`/`VerifyingOTP`). A chosen region routes straight to the shared `KYC` node; Brazil collects its CNPJ on the Avenia company form rather than on a dedicated step.
- **Graceful region-lock degradation** - `?kybLocked=` only pins the region when the code resolves to a known region. An unknown or empty code yields `regionLocked: false`, so the selector is shown with working back navigation instead of a dead-end.
- **Locked-region back behavior** - with `?kybLocked=`, the parent KYC `GO_BACK` is an explicit guarded no-op (it would otherwise restart the child KYC machine). The back button is **hidden** on the locked KYB entry screen and on the region selector (the selector is the root of the flow). Deeper KYB steps that own their own back navigation keep the button.
- **CNPJ-only validation** - `useKYBForm` gains a `requireCnpj` flag; when the tax ID is user-typed (the quote-less deep link), it must be a CNPJ, so a "business" entry can't silently resolve to an individual account downstream.
- **Region table as single source of truth** - `KYB_REGIONS` maps each region code to its fiat token (provider routing), label key, and optional `defaultLocale`. Adding Spanish for MX/CO later is a data-only change.
- **Shared package & backend** - `BrlaCreateSubaccountRequest.quoteId` is now optional; the backend stores it as a nullable `initialQuoteId` (provenance only, never an authorization input). The subaccount actor only requires a quote in the normal flow and skips the quote-bound KYC-status lookup in deep-link mode.
- **Misc** - the dropdown trigger press scale now actually animates (`transition-property` previously covered only colors), and the panel no longer animates on initial mount.

## Docs

- **OpenAPI** (`docs/api/openapi/vortex.openapi.json`) - `createSubaccount` `quoteId` is now documented as optional, with the quote-less KYB deep-link case described.
- **API guide** - new partner-facing page `docs/api/pages/13-kyb-deep-link.md` (registered in the Apidog page manifest) covering the flow, URL parameters, attribution, and embedding.
- **Security spec** (`docs/security-spec/05-integrations/brla.md`) - documents quote-less subaccount creation and that the nullable `initialQuoteId` does not weaken any access check.

## Testing

- `bun typecheck` clean, Biome clean on changed files, frontend test suite passing (23/23).
