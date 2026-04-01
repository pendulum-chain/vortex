# SEO Action Plan — vortexfinance.co

**Overall Score: 25/100**
**Audit Date:** 2026-03-26

Items are ordered by impact-to-effort ratio within each priority tier.

---

## CRITICAL — Fix immediately

### 1. Create `public/robots.txt` and `public/sitemap.xml`

**Effort:** 30 min | **Impact:** Removes two Critical crawlability failures

Create `apps/frontend/public/` directory (Vite copies it verbatim to build root, bypassing the `_redirects` catch-all):

`apps/frontend/public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://www.vortexfinance.co/sitemap.xml
```

`apps/frontend/public/sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.vortexfinance.co/</loc><lastmod>2026-03-26</lastmod></url>
  <url><loc>https://www.vortexfinance.co/business</loc><lastmod>2026-03-26</lastmod></url>
  <url><loc>https://www.vortexfinance.co/contact</loc><lastmod>2026-03-26</lastmod></url>
  <url><loc>https://www.vortexfinance.co/privacy-policy</loc><lastmod>2026-03-26</lastmod></url>
  <url><loc>https://www.vortexfinance.co/terms-and-conditions</loc><lastmod>2026-03-26</lastmod></url>
</urlset>
```

---

### 2. Fix the [●] governing law placeholder

**Effort:** 5 min | **Impact:** Removes live trust failure in published legal terms

**File:** `apps/frontend/src/translations/en.json:1204`

Replace:
```
"These Terms are governed by the laws of [●]."
```
With the actual governing jurisdiction (e.g. England and Wales for SatoshiPay Ltd).

---

### 3. Fix the "Stellar blockchain" factual inaccuracy

**Effort:** 5 min | **Impact:** Prevents AI citation contamination

**File:** `apps/frontend/src/translations/en.json:1309`

Rewrite `whyVortex.description` to accurately describe the Pendulum blockchain + XCM architecture. Remove all references to Stellar as the base layer (Stellar is a bridge destination, not the base).

---

### 4. Add three JSON-LD schema blocks to `index.html`

**Effort:** 20 min | **Impact:** Organization Knowledge Panel, brand disambiguation, SoftwareApp rich results

Add to `<head>` in `apps/frontend/index.html`. Copy the three ready-to-use snippets from `FULL-AUDIT-REPORT.md` (Organization, WebSite, SoftwareApplication). No library required — plain `<script type="application/ld+json">` tags.

Before deploying: verify `foundingDate`, add `sameAs` social URLs (Twitter/X, LinkedIn).

---

### 5. Add static fallback meta tags to `index.html`

**Effort:** 15 min | **Impact:** SERP snippets, social sharing previews

Add to `<head>` in `apps/frontend/index.html`:
```html
<meta name="description" content="Buy and sell USDC/USDT instantly. Fiat settlement in under 10 minutes across 44 European countries, Brazil, Argentina, and Mexico. 5-45 bps all-in fees." />
<meta property="og:title" content="Vortex | Cross-Border Crypto & Fiat Payments" />
<meta property="og:description" content="Buy and sell USDC/USDT instantly. Fiat settlement in under 10 minutes." />
<meta property="og:image" content="https://www.vortexfinance.co/og-image.png" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://www.vortexfinance.co/" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Vortex | Cross-Border Crypto & Fiat Payments" />
<meta name="twitter:description" content="Buy and sell USDC/USDT instantly. Fiat settlement in under 10 minutes." />
<meta name="twitter:image" content="https://www.vortexfinance.co/og-image.png" />
```
Also create a 1200×630px `og-image.png` and place it in `apps/frontend/public/`.

---

### 6. Guard TanStack Router Devtools behind DEV flag

**Effort:** 5 min | **Impact:** Removes devtools JS from production bundle

**File:** `apps/frontend/src/routes/__root.tsx`

```tsx
const TanStackRouterDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools
      }))
    )
  : () => null;
```

---

### 7. Reconcile the fee contradiction

**Effort:** 10 min | **Impact:** Removes trust failure visible to quality raters and users

**Files:** `en.json:1316` and `en.json:744`

Decide on the canonical fee range and update both:
- `whyVortex.features.lowFees.description` (currently "0.25%")
- `pages.business.pricing.description` (currently "0.5 - 0.85%")

Both should use the same accurate figure or a consistent description.

---

## HIGH — Fix within 1 week

### 8. Add immutable caching for hashed assets

**Effort:** 15 min | **Impact:** Eliminates revalidation requests on every repeat visit

Create `apps/frontend/netlify.toml` (or `netlify.toml` at repo root):
```toml
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

---

### 9. Add `manualChunks` to split the 7.78 MB monolithic JS bundle

**Effort:** 2 hrs (split + test) | **Impact:** Estimated 2–4s LCP improvement on mobile

**File:** `apps/frontend/vite.config.ts`

Add to `build.rollupOptions.output`:
```ts
manualChunks: {
  "vendor-react": ["react", "react-dom"],
  "vendor-polkadot": [
    "@polkadot/api",
    "@polkadot/api-contract",
    "@polkadot/util-crypto",
    "@polkadot/wasm-crypto",
    "@polkadot/rpc-provider"
  ],
  "vendor-stellar": ["stellar-sdk", "stellar-base"],
  "vendor-wallet": [
    "@reown/appkit",
    "@reown/appkit-adapter-wagmi",
    "@walletconnect/universal-provider"
  ],
  "vendor-xstate": ["xstate", "@xstate/react"],
  "vendor-motion": ["motion"]
}
```

Then move wallet/chain SDK initialization behind dynamic `import()` so `vendor-polkadot` and `vendor-stellar` are only fetched when the user initiates a transaction.

---

### 10. Add noindex to transactional app routes

**Effort:** 1 hr | **Impact:** Prevents indexing of thin/stateful application screens

Add `<meta name="robots" content="noindex, nofollow">` to the route components for:
- `/ramp`
- `/progress`
- `/success`
- `/failure`
- `/widget`
- `/alfredpay/*`

Use TanStack Router's `head()` function on each route or inject conditionally in `__root.tsx` based on the current route path.

---

### 11. Create an About / Company page

**Effort:** 1 day | **Impact:** YMYL trust requirement — surfaces who operates the service

Create a `/about` route with:
- Company name (SatoshiPay Ltd), registration details, founding story
- Regulated status and any licences held
- Team section (even minimal — names + LinkedIn)
- Mission statement
- Link from main navigation

---

### 12. Fix FAQ `<h1>` → `<h2>`

**Effort:** 2 min | **Impact:** Fixes invalid document heading outline

**File:** `apps/frontend/src/sections/individuals/FAQAccordion/index.tsx:43`

Change `<h1 className="...">` to `<h2 className="...">`.

---

### 13. Fix "Trusted By" section framing

**Effort:** 30 min | **Impact:** Removes misleading trust signal framing

**File:** `apps/frontend/src/sections/individuals/TrustedBy/index.tsx`

Split into: "Partners" row (Circle, Web3 Foundation, Plug and Play) and "Featured in" row (CoinDesk). Remove SEPA payment rail and MetaMask from the trust-signal row — they are not entities that trust the product.

---

### 14. Audit and remove `winston` from the browser bundle

**Effort:** 1 hr | **Impact:** Removes ~186 KB from the JS bundle

`winston-B4e42j7P.js` is 186 KB uncompressed. It is a server-side logger with no valid use in a browser context. Trace the import: likely `@vortexfi/shared` imports winston unconditionally. Options:
- Make the logger import conditional on `typeof window === 'undefined'`
- Replace with a browser-safe stub in the shared package's browser entry point
- Use `build.rollupOptions.external` to exclude winston from the browser build

Run `bun build:shared` after any change to `packages/shared`.

---

## MEDIUM — Fix within 1 month

### 15. Implement per-route head management (title, description, canonical)

**Effort:** 1 day | **Impact:** Unique titles and descriptions for each crawlable route

This requires either:
- **SSR/prerendering** (TanStack Start or `vite-plugin-ssr`) to deliver per-route head tags on the initial HTTP response, OR
- **Client-side `head()`** via TanStack Router (affects only what Google's renderer sees after JS execution — better than nothing, but not as strong as SSR)

Per-route title pattern:
```ts
export const Route = createFileRoute("/{-$locale}/")({
  head: () => ({
    meta: [
      { title: "Vortex | Buy & Sell USDC — EUR, BRL, ARS & More" },
      { name: "description", content: "Cross-border crypto payments. Fiat settlement in under 10 minutes." }
    ]
  })
});
```

---

### 16. Implement hreflang for en / pt-BR locale variants

**Effort:** 2 hrs | **Impact:** Google correctly routes language variants to respective users

Add from the `{-$locale}` layout route's `head()`:
```html
<link rel="alternate" hreflang="en" href="https://www.vortexfinance.co/" />
<link rel="alternate" hreflang="pt-BR" href="https://www.vortexfinance.co/pt-BR/" />
<link rel="alternate" hreflang="x-default" href="https://www.vortexfinance.co/" />
```
Also fix `<html lang="en">` in `index.html` to be set dynamically per locale.

---

### 17. Self-host Red Hat Display font

**Effort:** 2 hrs | **Impact:** Removes ~400ms from critical render path

1. Download WOFF2 files for Red Hat Display (Regular 400, Medium 500, Bold 700) from Google Fonts.
2. Place in `apps/frontend/public/fonts/`.
3. Add `@font-face` declarations with `font-display: swap` in `App.css`.
4. Remove the Google Fonts `<link>` from `index.html`.
5. Remove the `fonts.googleapis.com` and `fonts.gstatic.com` preconnect hints.

---

### 18. Update FAQ countries answer to include Mexico

**Effort:** 5 min | **Impact:** Content accuracy — reduces misinformation

**File:** `apps/frontend/src/translations/en.json:1232`

Add Mexico (and note Colombia as coming soon) to the supported countries answer.

---

### 19. Remove or update the expired airdrop banner

**Effort:** 10 min | **Impact:** Content freshness signal

**File:** `apps/frontend/src/translations/en.json:12`

If the airdrop is expired, hide the banner component or update the copy with a current offer date.

---

### 20. Create a standalone `/fees` page

**Effort:** 1 day | **Impact:** YMYL trust + high-intent search queries ("vortex fees", "crypto onramp fees")

A dedicated fees page with a structured table of fee tiers, currency breakdown, and comparison to market rates is both a trust signal and a keyword opportunity. Ensure the numbers are consistent with the rest of the site (see action 7).

---

### 21. Add `<meta name="robots" content="noindex">` to soft 404 component

**Effort:** 30 min | **Impact:** Prevents indexing of non-existent URLs returning 200

Find the in-app 404/error boundary component and add a `noindex` tag so Google's renderer marks those pages after execution.

---

### 22. Add `X-Frame-Options` and CSP headers

**Effort:** 30 min (done via netlify.toml in action 8 above, expand here)

Extend `netlify.toml` with a Content Security Policy:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://browser.sentry-cdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.sentry.io ..."
```

---

### 23. Update HSTS to include preload

**Effort:** 10 min | **Impact:** First-visit downgrade protection

Change HSTS from `max-age=31536000` to `max-age=63072000; includeSubDomains; preload` in `netlify.toml`, then submit `vortexfinance.co` to https://hstspreload.org/.

---

## LOW — Backlog

### 24. Implement IndexNow for Bing/Yandex

**Effort:** 2 hrs | **Impact:** Faster indexing on non-Google engines

Generate an IndexNow API key, place `{key}.txt` in `public/`, and trigger the IndexNow ping API from the Netlify deploy webhook when pages are updated.

---

### 25. Add `preconnect`/`modulepreload` hints for main JS chunk

**Effort:** 15 min | **Impact:** Minor LCP improvement by parallelizing bundle fetch

Add to `index.html`:
```html
<link rel="modulepreload" href="/assets/index-Bt2mtngd.js" />
<link rel="preconnect" href="https://o4504882726854656.ingest.sentry.io" />
```
Note: the `index-*.js` filename is content-hashed and changes on each build — either inline this via an `index.html` template plugin or manage it as a static reference.

---

### 26. Enrich hero image alt text with secondary keywords

**Effort:** 5 min | **Impact:** Minor image SEO improvement

**File:** `apps/frontend/src/sections/individuals/Hero/index.tsx:76,83`

Change from "Vortex cryptocurrency widget interface for buying crypto" to something like "Vortex USDC buy widget — convert EUR, BRL, or ARS to crypto instantly".

---

### 27. Move app.vortexfinance.co redirect from redirect.pizza to Netlify DNS

**Effort:** 30 min | **Impact:** Removes third-party dependency from redirect chain

Reduces latency by one hop and removes dependency on redirect.pizza uptime.

---

## Summary Checklist

| # | Action | Effort | Priority |
|---|---|---|---|
| 1 | Create `public/robots.txt` and `public/sitemap.xml` | 30 min | Critical |
| 2 | Fix `[●]` governing law placeholder | 5 min | Critical |
| 3 | Fix "Stellar blockchain" inaccuracy | 5 min | Critical |
| 4 | Add 3 JSON-LD schema blocks to `index.html` | 20 min | Critical |
| 5 | Add static fallback meta + OG tags to `index.html` | 15 min | Critical |
| 6 | Guard TanStackRouterDevtools with DEV flag | 5 min | Critical |
| 7 | Reconcile 0.25% vs 0.5–0.85% fee contradiction | 10 min | Critical |
| 8 | Add immutable caching + security headers (`netlify.toml`) | 15 min | High |
| 9 | Add `manualChunks` to split 7.78 MB JS bundle | 2 hrs | High |
| 10 | Add `noindex` to transactional app routes | 1 hr | High |
| 11 | Create `/about` page | 1 day | High |
| 12 | Fix FAQ `<h1>` → `<h2>` | 2 min | High |
| 13 | Fix "Trusted By" framing | 30 min | High |
| 14 | Audit and remove `winston` from browser bundle | 1 hr | High |
| 15 | Implement per-route head management | 1 day | Medium |
| 16 | Implement hreflang for en / pt-BR | 2 hrs | Medium |
| 17 | Self-host Red Hat Display font | 2 hrs | Medium |
| 18 | Update FAQ countries answer to include Mexico | 5 min | Medium |
| 19 | Remove/update expired airdrop banner | 10 min | Medium |
| 20 | Create `/fees` page | 1 day | Medium |
| 21 | Add `noindex` to soft 404 component | 30 min | Medium |
| 22 | Add CSP header | 30 min | Medium |
| 23 | Update HSTS to include preload | 10 min | Medium |
| 24 | Implement IndexNow | 2 hrs | Low |
| 25 | Add `modulepreload` for main JS chunk | 15 min | Low |
| 26 | Enrich hero image alt text | 5 min | Low |
| 27 | Move redirect from redirect.pizza to Netlify DNS | 30 min | Low |
