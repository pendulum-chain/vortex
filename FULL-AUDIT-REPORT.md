# SEO Full Audit Report — vortexfinance.co

**Audited URL:** https://app.vortexfinance.co (→ 301 → https://www.vortexfinance.co)
**Audit Date:** 2026-03-26
**Product:** Vortex Finance — cross-border crypto/fiat payments gateway (Pendulum blockchain)
**Business Type:** Fintech SaaS / DeFi onramp-offramp — YMYL category

---

## Overall SEO Health Score: 25 / 100

| Category | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 25% | 29/100 | 7.3 |
| Content Quality | 25% | 34/100 | 8.5 |
| On-Page SEO | 20% | 12/100 | 2.4 |
| Schema / Structured Data | 10% | 0/100 | 0.0 |
| Performance (Core Web Vitals) | 10% | 20/100 | 2.0 |
| Images | 5% | 50/100 | 2.5 |
| AI Search Readiness | 5% | 18/100 | 0.9 |
| **Total** | | | **23.6 → 25/100** |

---

## Top 5 Critical Issues

1. **Empty HTML shell** — the server delivers `<div id="app"></div>` with zero crawlable content. Every crawler that cannot execute JavaScript sees a blank page.
2. **No robots.txt or sitemap.xml** — both paths return the SPA shell instead of the expected files. Googlebot has no crawl directives and no URL inventory.
3. **7.78 MB monolithic JavaScript bundle** — LCP on mobile is estimated >4s, INP needs improvement. The single entry chunk co-bundles all Polkadot, Stellar, wallet, and XState libraries.
4. **No per-route titles, descriptions, or canonical tags** — every URL shares `<title>Vortex</title>` with no meta description and no canonical.
5. **Zero structured data** — no Organization, WebSite, or SoftwareApplication JSON-LD schema anywhere in the codebase.

## Top 5 Quick Wins

1. Create `apps/frontend/public/robots.txt` and `public/sitemap.xml` — 30-minute fix, removes two Critical crawlability failures.
2. Add three JSON-LD blocks to `index.html` (Organization, WebSite, SoftwareApplication) — copy-paste ready, no library needed.
3. Add immutable caching for `/assets/*` via `netlify.toml` — one config change, eliminates revalidation on every repeat visit.
4. Fix the `[●]` governing law placeholder in `en.json:1204` — trivial edit, eliminates a live trust failure.
5. Fix the `whyVortex.description` Stellar→Pendulum factual inaccuracy in `en.json:1309` — trivial edit, prevents AI citation contamination.

---

## Technical SEO

**Score: 29/100**

### CRITICAL

#### T-C1 — robots.txt and sitemap.xml do not exist

Both `/robots.txt` and `/sitemap.xml` return the SPA `index.html` shell (HTTP 200, content-type: text/html). The Netlify catch-all `/* /index.html 200` in `apps/frontend/_redirects` intercepts these paths before any static file can serve.

**Root cause:** Neither file exists in `apps/frontend/` (there is no `public/` directory). Vite copies everything in `public/` verbatim to the build root, bypassing the catch-all redirect because Netlify serves existing static files first.

**Fix:** Create `apps/frontend/public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://www.vortexfinance.co/sitemap.xml
```
Create `apps/frontend/public/sitemap.xml`:
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

#### T-C2 — HTML shell is entirely empty — zero server-delivered content

The HTTP response for every URL is a 2,016-byte document containing only `<div id="app"></div>`. All content is JavaScript-rendered. Social crawlers, AI training crawlers, most non-Google bots, and Google's second-wave rendering queue are all affected.

**Impact:** Google can render JavaScript (deferred queue), but ranking signals are weaker than server-rendered content. Bing, DuckDuckGo, LinkedIn, WhatsApp, and all AI citation bots see a blank page.

**Fix options in priority order:**
1. Pre-render marketing routes (`/`, `/business`, `/contact`, `/privacy-policy`, `/terms-and-conditions`) at build time using `vite-plugin-ssr` or TanStack Router's prerender API. Keep app/ramp routes as CSR.
2. SSR (TanStack Start or Vite SSR).
3. Dynamic rendering (Rendertron/Puppeteer for bots only).

#### T-C3 — All non-existent paths return HTTP 200 (soft 404)

The Netlify `_redirects` catch-all `/* /index.html 200` returns 200 for every URL, including invalid paths. Google treats these as valid pages and may index them.

**Fix:** Add `<meta name="robots" content="noindex">` to the in-app 404 route component so Google's renderer marks them as noindex after rendering.

### HIGH

#### T-H1 — Generic `<title>Vortex</title>` on every route

The static `<title>` in `index.html` applies to all pages. No per-route head management exists in the codebase (no `@tanstack/router` head API usage, no react-helmet).

**Fix:** Use TanStack Router's `head()` function on each route's `createFileRoute`:
```ts
export const Route = createFileRoute("/{-$locale}/")({
  head: () => ({
    meta: [
      { title: "Vortex | Cross-Border Crypto & Fiat Payments" },
      { name: "description", content: "Buy and sell USDC/USDT in 44 European countries, Brazil, Argentina, and Mexico. Fiat settlement in under 10 minutes." }
    ]
  })
});
```
Note: Per-route titles from `head()` only render correctly with SSR/prerendering. Without it, all routes still serve the static `index.html` title on initial load.

#### T-H2 — No meta description on any page

Zero `<meta name="description">` tags. Google generates its own SERP snippets from rendered content — which it cannot reliably do for a pure CSR SPA.

**Fix:** Add via TanStack Router `head()` per route (same approach as T-H1).

#### T-H3 — No canonical tags

With locale-prefixed routing (`/{-$locale}/`), pages are reachable at both `/` and `/en/`. No `<link rel="canonical">` exists. Duplicate content signals split ranking authority.

#### T-H4 — No Content Security Policy header

`www.vortexfinance.co` delivers only `strict-transport-security`. No CSP, no `X-Frame-Options`, no `Permissions-Policy`. This is a security risk and a minor trust signal gap.

**Fix:** Add `netlify.toml`:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

#### T-H5 — Main JS bundle is 7.78 MB (2.09 MB brotli)

All vendor libraries — `@polkadot/api`, `stellar-sdk`, `@reown/appkit`, `secp256k1`, `xstate`, `motion`, `winston` — are co-bundled into a single synchronous entry chunk. Route-level code is correctly split (95 lazy chunks via TanStack Router's `autoCodeSplitting`), but vendors are not.

**Fix:** Add `manualChunks` to `apps/frontend/vite.config.ts`:
```ts
rollupOptions: {
  output: {
    manualChunks: {
      "vendor-react": ["react", "react-dom"],
      "vendor-polkadot": ["@polkadot/api", "@polkadot/util-crypto", "@polkadot/wasm-crypto"],
      "vendor-stellar": ["stellar-sdk", "stellar-base"],
      "vendor-wallet": ["@reown/appkit", "@reown/appkit-adapter-wagmi", "@walletconnect/universal-provider"],
      "vendor-xstate": ["xstate", "@xstate/react"],
      "vendor-motion": ["motion"]
    }
  }
}
```

#### T-H6 — TanStack Router Devtools in production bundle

`apps/frontend/src/routes/__root.tsx` imports and renders `<TanStackRouterDevtools />` unconditionally.

**Fix:**
```tsx
const TanStackRouterDevtools = import.meta.env.DEV
  ? (await import("@tanstack/react-router-devtools")).TanStackRouterDevtools
  : () => null;
```

### MEDIUM

#### T-M1 — No hreflang for en/pt-BR locale variants

The router supports `/{-$locale}/` (English default) and `/pt-BR/` routes. No `<link rel="alternate" hreflang>` tags exist. Google cannot determine which locale URL to serve to which user.

**Fix:** Emit from the `{-$locale}` layout route's `head()`:
```html
<link rel="alternate" hreflang="en" href="https://www.vortexfinance.co/" />
<link rel="alternate" hreflang="pt-BR" href="https://www.vortexfinance.co/pt-BR/" />
<link rel="alternate" hreflang="x-default" href="https://www.vortexfinance.co/" />
```

#### T-M2 — HSTS missing includeSubDomains and preload

Current: `strict-transport-security: max-age=31536000`. Missing `includeSubDomains; preload`.

**Fix:** Set to `max-age=63072000; includeSubDomains; preload` and submit to https://hstspreload.org/.

#### T-M3 — Google Fonts loaded as render-blocking external stylesheet

`<link href="https://fonts.googleapis.com/..." rel="stylesheet">` adds two network RTTs to first text paint (~400ms). `font-display: swap` is set by Google's CDN, mitigating FOIT but causing FOUT reflow.

**Fix (preferred):** Self-host Red Hat Display woff2 files in `apps/frontend/public/fonts/` and declare `@font-face` in `App.css`. Remove the Google Fonts `<link>`.

**Fix (minimum):** Add a `preload` for the woff2 file to `index.html`:
```html
<link rel="preload" as="font" type="font/woff2" crossorigin
  href="https://fonts.gstatic.com/s/redhatdisplay/v21/...woff2" />
```

#### T-M4 — No Open Graph / Twitter Card meta tags

No `og:title`, `og:description`, `og:image`, `twitter:card`. Links shared on LinkedIn, Twitter/X, WhatsApp render as blank cards.

**Fix:** Add to `index.html` (static fallback) and per-route via `head()`:
```html
<meta property="og:title" content="Vortex | Cross-Border Crypto Payments" />
<meta property="og:description" content="Buy and sell USDC/USDT. Fiat settlement in under 10 minutes across 44 European countries, Brazil, Argentina, and Mexico." />
<meta property="og:image" content="https://www.vortexfinance.co/og-image.png" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```

#### T-M5 — Transactional app routes not marked noindex

Routes `/ramp`, `/progress`, `/success`, `/failure`, `/widget`, `/alfredpay/*` are application state screens. They lack `<meta name="robots" content="noindex, nofollow">` and may be indexed by Google's renderer.

#### T-M6 — Asset caching uses max-age=0 despite content-hashed filenames

All `/assets/*.js` and `/assets/*.css` files have `cache-control: public, max-age=0, must-revalidate`. Vite generates content-hashed filenames that guarantee immutability. Every repeat visit triggers a full revalidation round-trip.

**Fix:** Add to `netlify.toml`:
```toml
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### LOW

#### T-L1 — app.vortexfinance.co redirects via third-party redirect.pizza

`app.vortexfinance.co` 301-redirects to `www.vortexfinance.co` via redirect.pizza infrastructure (adds latency and external dependency). Consider moving the redirect to Netlify DNS natively.

#### T-L2 — IndexNow not implemented

No IndexNow key file. Bing, Yandex, and Naver do not receive instant update notifications.

#### T-L3 — web manifest path uses non-standard `/frontend/` prefix

`<link rel="manifest" href="/frontend/site.webmanifest">` — verify this path resolves correctly after every deploy.

---

## Content Quality & E-E-A-T

**Score: 34/100**

| E-E-A-T Factor | Score |
|---|---|
| Experience | 40/100 |
| Expertise | 42/100 |
| Authoritativeness | 35/100 |
| Trustworthiness | 38/100 |
| **AI Citation Readiness** | **18/100** |

### CRITICAL

#### C-C1 — Terms and Conditions governing law is an unfilled placeholder

**File:** `apps/frontend/src/translations/en.json:1204`
**Value:** `"These Terms are governed by the laws of [●]."`

This literal bracket placeholder is live in the published legal terms. Under Google's QRG, unfilled template placeholders in legal copy are a direct Trustworthiness failure for a YMYL financial service. Fix: replace `[●]` with the actual governing jurisdiction (e.g. England and Wales, if SatoshiPay Ltd is UK-incorporated).

#### C-C2 — Factual inaccuracy: "built on top of the Stellar blockchain"

**File:** `apps/frontend/src/translations/en.json:1309`
**Value:** `"It is built on top of the Stellar blockchain and uses the Stellar SDK..."`

Vortex is built on the Pendulum blockchain using XCM. Stellar is one bridge destination, not the base layer. This copy appears to be leftover from an earlier product iteration. Under QRG, factual inaccuracy in feature descriptions is an Expertise penalty. It also creates an AI citation contamination risk — AI systems scraping this copy will describe Vortex as Stellar-based.

**Fix:** Update to accurately describe the Pendulum + XCM architecture.

#### C-C3 — Fee contradiction between WhyVortex and Business page

**Files:** `en.json:1316` and `en.json:744`
- `whyVortex.features.lowFees.description`: "Fees are at just 0.25%"
- `pages.business.pricing.description`: "Users pay 0.5 - 0.85%"

Two live pages on the same domain state contradictory fee levels. This is a Trustworthiness failure — a quality rater evaluating fee transparency would flag this immediately.

### HIGH

#### C-H1 — No About or Team page

The route tree has no `/about` or `/team` route. The company (SatoshiPay Ltd) is mentioned only deep in the Privacy Policy. Under September 2025 QRG, YMYL financial services are expected to clearly surface who operates the service.

#### C-H2 — "Trusted By" section conflates partners, ecosystem tools, and media

The `TrustedBy` component displays Circle, Polkadot, Ethereum, MetaMask, Web3 Foundation, CoinDesk, SEPA, and Plug and Play under a single "Trusted by" heading. CoinDesk is a media outlet (not a trust-giver). SEPA is a payment rail. MetaMask is a wallet tool used by all competitors. This framing is misleading.

**Fix:** Split into distinct sections: "Partners" (Circle, Web3 Foundation, Plug and Play) and "As seen in" (CoinDesk). Remove SEPA and MetaMask from the trust-signal row.

#### C-H3 — FAQ countries answer is outdated

**File:** `en.json:1232`
**Value:** "Vortex is available in all 44 European countries and also supports users in Brazil and Argentina."

The product now supports MXN (Mexico) and is actively building COP (Colombia) as shown by `MXN_tokenUnavailable` and `COP_tokenUnavailable` translation keys. The FAQ should reflect current geographic scope.

#### C-H4 — No standalone Pricing / Fees page

Fee information is embedded in FAQ answers and the live widget. For a YMYL financial service, a dedicated `/fees` or `/pricing` page with clear tabular data is both an SEO opportunity and a trust signal requirement.

### MEDIUM

#### C-M1 — FAQ section uses `<h1>` instead of `<h2>`

**File:** `apps/frontend/src/sections/individuals/FAQAccordion/index.tsx:43`

The FAQ heading is marked `<h1>`. The page already has an `<h1>` in the Hero. Multiple `<h1>` tags create an invalid document outline.

**Fix:** Change to `<h2>`.

#### C-M2 — Homepage H1 lacks geographic and token specificity

Current H1: "Buy and Sell crypto. Fast, secure, best rates." No geographic qualifier, no token names, no differentiating claim. Competitors use identical phrasing.

**Fix:** Consider: "Buy and Sell USDC Instantly — EUR, BRL, ARS & More" or similar, which incorporates keywords without being unnatural.

#### C-M3 — Airdrop banner references an expired date

**File:** `en.json:12`
**Value:** `"Special offer until 27 May"`

If this banner is still conditionally rendered, it shows an expired promotional claim (current date: March 2026). A quality rater sees this as a content freshness failure.

#### C-M4 — "Thank you for using our new product!" frames Vortex as new/unproven

**File:** `en.json:295`

This copy in the post-transaction confirmation screen undermines the Experience E-E-A-T signal. Remove "new" or replace with copy that reinforces reliability.

#### C-M5 — Homepage content word count is ~380–420 words

Below the 500-word minimum for establishing topical coverage. Topical depth matters for competitive financial service queries.

### LOW

#### C-L1 — Hero image alt text is functional but not keyword-enriched

**File:** `apps/frontend/src/sections/individuals/Hero/index.tsx:76,83`
Alt: "Vortex cryptocurrency widget interface for buying crypto" — functional but misses secondary keywords like USDC, EUR, stablecoin.

#### C-L2 — No content freshness signals on FAQ or fees content

Only the Privacy Policy has a "Last updated" date. Add "Last reviewed" dates to the FAQ and supported currencies sections.

#### C-L3 — `<html lang="en">` is hardcoded regardless of locale

**File:** `apps/frontend/index.html:2`
The Portuguese locale variant (`/pt-BR/`) serves `lang="en"`. Fix: set `lang` dynamically per locale in the `<html>` tag (requires SSR or a head management approach).

---

## Schema / Structured Data

**Score: 0/100** — No structured data of any kind exists anywhere in the application.

### Missing Schema (by severity)

| Schema Type | Severity | Notes |
|---|---|---|
| `Organization` | Critical | Google Knowledge Panel eligibility. Required for financial services brand disambiguation. |
| `WebSite` | Critical | Sitelinks eligibility via `SearchAction`. Brand authority signal. |
| `SoftwareApplication` | High | Direct product match. Enables app-category rich results. |
| `Service` | Medium | Describes the cross-border payment service with `areaServed` and `serviceType`. |
| `FAQPage` | Do NOT implement | Restricted to government/healthcare sites since August 2023. Will not produce rich results for a fintech app. |

### Ready-to-use JSON-LD Snippets

Add all three to `<head>` in `apps/frontend/index.html`:

**Organization:**
```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Vortex Finance",
  "url": "https://www.vortexfinance.co",
  "logo": "https://www.vortexfinance.co/frontend/favicon-32x32.png",
  "description": "Cross-border payments gateway enabling fast, low-cost conversion between cryptocurrency and fiat currencies across Europe, Brazil, Argentina, and Mexico.",
  "areaServed": [
    { "@type": "Place", "name": "European Union" },
    { "@type": "Country", "name": "Brazil" },
    { "@type": "Country", "name": "Argentina" },
    { "@type": "Country", "name": "Mexico" }
  ],
  "sameAs": ["https://vortexfinance.co"],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "url": "https://www.vortexfinance.co/contact"
  }
}
</script>
```

**WebSite:**
```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Vortex Finance",
  "url": "https://www.vortexfinance.co",
  "description": "Buy and sell USDC and USDT stablecoins on Polkadot, Arbitrum, Avalanche, Base, BNB, Ethereum, and Polygon. Fiat settlement in under 10 minutes.",
  "inLanguage": ["en", "pt-BR"]
}
</script>
```

**SoftwareApplication:**
```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Vortex Finance",
  "url": "https://www.vortexfinance.co",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "description": "A cross-border payments app for buying and selling USDC and USDT stablecoins. Supports EUR, BRL, ARS, USD, MXN, and COP fiat currencies.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Free to use. Transaction fees disclosed upfront before each trade."
  },
  "provider": {
    "@type": "Organization",
    "name": "Vortex Finance",
    "url": "https://www.vortexfinance.co"
  }
}
</script>
```

---

## Sitemap

**Score: 0/100** — No sitemap exists.

See fix in T-C1 above. Key points:
- Use `www.vortexfinance.co` canonical URLs (not `app.`).
- Include: `/`, `/business`, `/contact`, `/privacy-policy`, `/terms-and-conditions`.
- Exclude: `/widget`, `/terms-and-conditions-full`, `/ramp`, `/progress`, `/success`, `/failure`.
- Omit `priority` and `changefreq` — Google publicly ignores both.
- Do not include locale-prefixed routes unless paired with `hreflang` annotations.

---

## Performance (Core Web Vitals)

| Metric | Assessment | Estimate |
|---|---|---|
| LCP | **POOR** | >4.0s on mobile |
| INP | **NEEDS IMPROVEMENT** | 200–500ms |
| CLS | **GOOD** | ≤0.1 |

**LCP root cause:** The server delivers an empty `<div id="app">` — zero content until 2.09 MB of JavaScript is downloaded, parsed, and React bootstraps. On a 4G mobile connection (~10 Mbps), download alone takes ~1.7s, then CPU parse/execute adds 1–3s on a mid-tier Android device.

**INP root cause:** 7.78 MB of synchronous JavaScript creates long tasks at startup, blocking the main thread and inflating interaction delay for any user action within the first several seconds.

**CLS is good:** `font-display: swap` prevents FOIT, minor FOUT reflow stays within 0.1. No layout-shifting images in the initial render.

### Performance Fixes (prioritized)

1. **`manualChunks` in `vite.config.ts`** — split `@polkadot/*`, `stellar-sdk`, `@reown/appkit`, `secp256k1` into async vendor chunks. None of these are needed for the initial route render. Estimated LCP improvement: 2–4s on mobile.
2. **Immutable asset caching in `netlify.toml`** — set `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`. Eliminates revalidation on repeat visits.
3. **Self-host Red Hat Display font** — removes two external RTTs (~400ms) from the critical rendering path.
4. **Audit `winston` in browser bundle** — the `winston-B4e42j7P.js` chunk is 186 KB. A server-side logger should not be in a browser bundle. Likely imported transitively via `@vortexfi/shared`.
5. **Add CSS loading skeleton to `index.html`** — inline CSS-only skeleton inside `<div id="app">` provides visual feedback before JS executes.
6. **Add `rel="modulepreload"` for main JS chunk** — starts fetch earlier in the waterfall.

---

## Images

**Score: 50/100**

- Hero images have functional alt text but lack keyword specificity.
- No images in the static HTML shell — all images are dynamically rendered. Not a primary LCP concern.
- SVG icons and coin images are correctly inlined or lazily loaded by React.
- No oversized raster images detected in the build output.
- Modern format (WebP/AVIF) adoption not assessed — primary images are SVG.

---

## AI Search Readiness

**Score: 18/100**

The low score is structural, not a content quality issue:
- All content is JavaScript-rendered — AI training crawlers that do not execute JS cannot index any copy.
- No Organization schema — AI systems cannot reliably associate the product with a legal entity.
- The Stellar/Pendulum factual inaccuracy creates citation contamination risk.
- The fee contradiction (0.25% vs 0.5–0.85%) means AI systems may surface conflicting claims.
- **Positive:** The quotable specifics that do exist are strong citation candidates — "fiat settlement in under 10 minutes", "KYC takes less than six minutes", "5–45 bps all-in cost", "transactions in about three minutes" — but they need to be in crawlable HTML to be discovered.

---

## Relevant Source Files

| File | Issues |
|---|---|
| `apps/frontend/index.html` | No description, no OG, static title, no schema, no canonical |
| `apps/frontend/_redirects` | Catch-all intercepts robots.txt and sitemap.xml |
| `apps/frontend/vite.config.ts` | No manualChunks, devtools not guarded |
| `apps/frontend/src/routes/__root.tsx` | TanStackRouterDevtools unconditionally rendered |
| `apps/frontend/src/translations/en.json:1204` | Unfilled [●] governing law placeholder |
| `apps/frontend/src/translations/en.json:1309` | "Stellar blockchain" factual inaccuracy |
| `apps/frontend/src/translations/en.json:1316` | Fee contradiction: 0.25% |
| `apps/frontend/src/translations/en.json:744` | Fee contradiction: 0.5–0.85% |
| `apps/frontend/src/sections/individuals/FAQAccordion/index.tsx:43` | `<h1>` should be `<h2>` |
| `apps/frontend/src/sections/individuals/TrustedBy/index.tsx` | Misleading "trusted by" framing |
| `apps/frontend/src/sections/individuals/Hero/index.tsx:76,83` | Alt text could be more specific |
