# KYB Deep Link

The KYB deep link takes a business user straight into KYB (Know Your Business) verification from a single widget URL — **no quote required**. Use it when you want a partner's users to complete business verification ahead of, or independently from, any ramp.

It is a variant of the [hosted widget](https://api-docs.vortexfinance.co/widget-integration): instead of `POST /v1/session/create`, you link the user directly to the widget with a KYB query parameter.

## Flow

```
?kyb / ?kybLocked  →  email + OTP sign-in  →  region selector  →  provider KYB  →  "KYB Completed" screen
```

- **Brazil** routes to Avenia KYB. The user enters the company name and CNPJ together on the company form, then completes Avenia's hosted company and representative verification.
- **Mexico / Colombia / USA** route to the Alfredpay business KYB form (the business customer type is preselected).
- Europe is intentionally excluded — it is individual KYC only and requires a connected wallet, so it cannot complete a quote-less KYB deep link.

After verification the user lands on a **KYB Completed** screen. *Continue* returns them to the standard quote form with the session still authenticated and the deep-link parameters stripped from the URL.

## URL Parameters

Append one of these to the widget URL (e.g. `https://widget.vortexfinance.co/en/widget?kyb`):

| URL | Behavior |
|---|---|
| `?kyb` | KYB mode; the region selector is shown. |
| `?kyb=BR` \| `MX` \| `CO` \| `US` | Selector shown with the region preselected. The user can still change it. |
| `?kybLocked=BR` \| `MX` \| `CO` \| `US` | Selector skipped, region pinned, back navigation into the selector disabled. |
| `?kybLocked=BR` (specifically) | Additionally defaults the widget locale to `pt-BR`. An explicit locale in the path still wins (e.g. `/en/widget?kybLocked=BR` stays English). |
| unknown or empty region code (e.g. `?kybLocked=ZZ`, `?kybLocked`) | Degrades gracefully to the open selector; the region is **not** treated as locked. |

Query keys are case-sensitive: use `kyb` and `kybLocked` exactly. Region codes are case-insensitive.

## Attribution

`externalSessionId`, `partnerId`, and `apiKey` are forwarded in KYB mode exactly as in the quoted widget flow, so partner and session attribution work the same way:

```
https://widget.vortexfinance.co/en/widget?kybLocked=BR&externalSessionId=my-session-id&partnerId=my-partner&apiKey=pk_live_...
```

Pass your partner public key (`pk_live_*` / `pk_test_*`) as `apiKey` for attribution. `externalSessionId` is your own opaque identifier and is echoed back in [webhook payloads](https://api-docs.vortexfinance.co/webhooks).

## Embedding

The KYB deep link is a normal widget URL, so the same embed options apply:

```html
<iframe
  src="https://widget.vortexfinance.co/en/widget?kybLocked=BR&externalSessionId=my-session-id"
  allow="clipboard-write"
  style="width: 100%; height: 720px; border: 0;"
></iframe>
```

```js
window.open(
  "https://widget.vortexfinance.co/en/widget?kybLocked=BR&externalSessionId=my-session-id",
  "vortex-kyb",
  "width=480,height=760"
);
```

## Underlying KYB Onboarding

For Brazil, the deep link drives `POST /v1/brla/createSubaccount` **without** a `quoteId` — the subaccount is created from the company name and CNPJ collected on the form, and the optional quote association is simply omitted. See [BRL / KYC Notes](https://api-docs.vortexfinance.co/brl-kyc-notes) for how BRLA onboarding relates to the ramp flow.

---
