# BlindPay — Research Report

Research date: 2026-07-07
Scope: `https://www.blindpay.com/docs/getting-started/overview` and the linked Essentials pages.
Goal: assess whether BlindPay can fit Vortex's existing headless integration style (the way we do BRLA / Stellar / Nabla onramp+offramp today) for the four questions below.

> **TL;DR**
> 1. **KYC/KYB is fully headless** — we POST all PII and document URLs ourselves; no hosted UI / iframe / link to send the user to. Same shape as our existing flows.
> 2. **No Sumsub / Persona / Veriff import or sharing.** Verification is done in-house; we cannot reuse an existing Vortex KYC into BlindPay, and we cannot reuse a BlindPay KYC anywhere else. The "RFI" mechanism is for *their* compliance team to ask *our* customer for more info — it is not a 3rd-party KYC handoff.
> 3. **Yes, a signature is required** to bind an *external* destination on-chain address to a customer (recommended "secure" flow). There are **two no-signature workarounds**: (a) the disclaimed "paste the address" non-secure path, and (b) more importantly, **a BlindPay-managed wallet** that we receive the address from BlindPay and never need the user to sign anything. Same applies to AA wallets.
> 4. **Per-customer US virtual accounts exist** (routing+account number, no real "IBAN"). Deposits to them auto-generate a payin server-side. **However**, the payin object still appears to require a prior `payin_quote` per the docs — needs a sales clarification. Non-US rails (Brazil PIX, Mexico SPEI, Argentina, Colombia PSE) are quote-based, not "deposit anytime to a fixed account".
> 5. **No European IBAN / SEPA / SEPA Instant today.** SEPA is officially listed as `Europe (soon)`. Right now the only way to receive money from a European bank is via international SWIFT (5 business days, requires an invoice/PO-style compliance document per transfer). No "fixed IBAN deposit anytime" model for EUR.

---

## 1. Is the KYC/B flow headless?

**Yes — fully API-driven. No hosted-UI redirect, no iframe, no magic link.**

### Evidence

From the Customers page:

> "For compliance and regulatory requirements, **every customer on your platform must be registered as a customer in BlindPay**. […] Every customer must complete a KYC process to verify their identity before sending or receiving funds."
> — https://www.blindpay.com/docs/essentials/customers

The "Create a customer" section is a single cURL `POST` per KYC type, with tabs labelled `Standard KYC`, `Enhanced KYC`, `Standard KYB`. All required fields (name, DOB, address, tax ID, ID document type/front/back, selfie, proof-of-address, etc.) are sent as a JSON body. There is no reference anywhere in the page to a redirect URL, hosted form, or iframe for the user to complete. — https://www.blindpay.com/docs/essentials/customers

The required-fields table confirms the shape (excerpt):

> | Individual | Business |
> | First name, Last name, Date of birth, Email, Country, Tax ID, Phone, IP, Address 1/2, City, State, Postal code, ID Document – Country / Type / Front / Back, Proof of Address – Type / Document, Selfie File | Legal name, Tax ID, Formation date, Email, Country, Doing business as\*, Website\*, IP, Address, UBOS + Shareholders above 25%, Company Formation Document, Proof of Ownership Document, Proof of Address… |
> — https://www.blindpay.com/docs/essentials/customers

### Document handling is also headless

> "Upload generates file URLs from your customers' KYC documents and pictures. BlindPay encrypts them before sharing with vendors and saving them in our database, helping you stay compliant with data protection laws."
> — https://www.blindpay.com/docs/essentials/upload

So the flow is: collect the file → `POST /v1/upload` → get back an encrypted `file_url` → put that URL in the `POST /v1/.../customers` body. Same shape as we use today for BRLA.

### AI pre-screen available

> "Analyze Document reads a PDF, JPG, or PNG with AI, checks it against the rules for its document type, and returns an `approval_rate` of `low`, `medium`, or `high` plus a short reason. Use it to pre-screen customer documents before submitting them for KYC, so you can prompt for a better file early instead of waiting for a rejection."
> — https://www.blindpay.com/docs/essentials/analyze-document

### RFI (compliance follow-up) is also headless

> "A Request for Information (RFI) is how BlindPay's compliance team asks for missing or clarifying details when a customer's KYC or KYB review is incomplete. […] 4. **Collect the fields** from your customer through your own UI. 5. **`POST /v1/.../rfi`** to submit the response in a single shot."
> — https://www.blindpay.com/docs/essentials/rfi

So when BlindPay's compliance team needs more info, we don't redirect the user to a BlindPay page — we `GET` the field list, render it in our own UI, and `POST` the response.

### Timing

> "KYC Standard: ~60 seconds" (automated)
> "KYC Enhanced / KYB Standard: 3 hours to 1 business day" (manual review)
> — https://www.blindpay.com/docs/essentials/customers

### Conclusion

This matches our Vortex pattern exactly: we own the form, we own the UX, we just hit BlindPay's API with the data and the doc URLs. We never send the user to a BlindPay page.

---

## 2. Does it allow Sumsub or equivalent KYC sharing?

**No. No third-party KYC provider is mentioned, and there is no documented way to import or share KYC data with/from BlindPay.**

### Evidence

- I searched the docs sitemap, knowledge base and the customers / RFI / upload / analyze-document pages. The only names that appear are BlindPay's own "compliance team" and "vendors" (used in the upload encryption copy).
- The verification is done **in-house by BlindPay**:

  > "**KYC Standard** is the default verification. It's automated and typically completes in about 60 seconds."
  > "**KYC Enhanced** […] all submissions are manually reviewed by the compliance team."
  > — https://www.blindpay.com/knowledge-base/guides/kyc-basics

- The only data-reuse mechanism in the API surface is **RFI** — and it is one-way: BlindPay compliance → asks our customer → we `POST` the answer back. It does not let us hand them a Sumsub applicant ID, nor let us extract a BlindPay KYC for use elsewhere.

  > "**There can only be one open RFI per customer at a time.** If compliance needs another round, a new RFI is created after the previous one is reviewed."
  > — https://www.blindpay.com/docs/essentials/rfi

- The upload pipeline explicitly states files are encrypted **by BlindPay** before being passed to vendors — implying vendor hops are BlindPay's choice, not ours:

  > "BlindPay encrypts them before sharing with vendors and saving them in our database"
  > — https://www.blindpay.com/docs/essentials/upload

### What this means for Vortex

- We **cannot** reuse the KYC we already do for BRLA / the rest of our flows when we onboard a customer to BlindPay. Every BlindPay customer has its own BlindPay KYC lifecycle (`verifying` → `approved`/`rejected`/`compliance_request`).
- We also **cannot** reuse a BlindPay-approved KYC in any other provider — the data lives inside BlindPay.
- Net effect: if we put BlindPay behind a partner on the Vortex stack, that partner's end-customers go through a **second, independent KYC** with BlindPay. We must surface BlindPay's status (`verifying`/`approved`/etc.) in our UI, just like we already do for BRLA's KYC status.

### Worth confirming with BlindPay sales

- Whether they offer any "re-use existing KYC" partner program (e.g. via a signed attestation) for regulated platforms. The docs do not describe one.

---

## 3. On-chain address (onramp destination) — signature required?

**Yes for the recommended "secure" path, but the question is more nuanced than just yes/no.** There are three distinct ways to attach a destination address to a customer, and only one of them requires the user to sign. The signature is an off-chain `personal_sign`-style message, not an on-chain transaction.

### Option A — Secure flow (recommended): user signs a message

This is the path the docs push you toward. The full flow:

1. **`GET` the message to sign** from BlindPay for this customer.
2. **User signs the message** in their own wallet. The docs explicitly recommend a standard library:

   > "Use a library like **wagmi** or **ethers.js** to sign the message and get the signature transaction hash."
   > — https://www.blindpay.com/docs/essentials/blockchain-wallets

   This is plain `eth_signMessage` / viem's `signMessage` / wagmi's `useSignMessage` — i.e. an **EIP-191 `personal_sign`** string, not EIP-712 typed data, not an on-chain transaction. It is conceptually the same kind of ownership proof used by Sign-In With Ethereum (SIWE).
3. **`POST` the resulting `signature_tx_hash` + the wallet address** to BlindPay to attach the wallet to the customer.

> "**Add a blockchain wallet (secure)** — This method attaches a wallet without entering the address manually. The steps are: 1. **Get the message to sign** 2. **Sign the message** 3. **Use the signature transaction hash to add the blockchain wallet**"
> — https://www.blindpay.com/docs/essentials/blockchain-wallets

**What it proves:** the user controls the private key for the address. It does **not** transfer any funds, does **not** authorise future transfers, and is **not** an `approve`/`permit` of any kind. It is purely a one-time ownership attestation.

**Account Abstraction (AA) is supported:**

> "**Universal Wallet Support**: Compatible with all types of blockchain wallets, including Externally Owned Accounts (EOA) and Account Abstraction (AA) wallets"
> — https://www.blindpay.com/docs/getting-started/overview

and

> "Set the `is_account_abstraction` field to `true` and fill the `address` field with the wallet address."
> — https://www.blindpay.com/docs/essentials/blockchain-wallets (non-secure path doc, but the `is_account_abstraction` flag is wallet-type metadata, not auth-method-specific)

**Supported chains for the secure flow** (these are the chains whose addresses can be bound to a customer as a payin destination):

> | Chain | Mainnet chain ID | Testnet |
> | Ethereum | 1 | Ethereum Sepolia (11155111) |
> | Polygon | 137 | PoS Amoy (80002) |
> | Base | 8453 | Base Sepolia (84532) |
> | Arbitrum | 42161 | Arbitrum Sepolia (421614) |
> | Stellar | — | Stellar Testnet |
> | Solana | — | Solana Devnet |
> | Tron | — | — |
> — https://www.blindpay.com/docs/essentials/blockchain-wallets and https://www.blindpay.com/knowledge-base/guides/supported-chains

No Pendulum/Polkadot/Substrate chain. If our Vortex users want the onramp destination to be on Pendulum, we have to bridge downstream.

**Hard prerequisite for the onramp:**

> "You also need a [blockchain wallet](https://www.blindpay.com/docs/essentials/blockchain-wallets#add-a-blockchain-wallet-secure) and a [payin quote](https://www.blindpay.com/docs/essentials/payin-quotes#create-a-payin-quote)."
> — https://www.blindpay.com/docs/essentials/payins

So the wallet must be signed-for and registered before the payin quote is created.

### Option B — Non-secure flow: paste the address, no signature

> "**Add a blockchain wallet (non-secure)** — This method is not recommended because **if the funds are sent to the wrong address, the funds will be lost.**"
> — https://www.blindpay.com/docs/essentials/blockchain-wallets

You set `is_account_abstraction: true` and pass the `address` directly, with no proof of ownership. The docs only do this for AA wallets in the non-secure example, but the same shape is available for EOAs.

**Why this exists:** so that you can pre-register a destination address on behalf of a customer when the user isn't connected to a wallet yet (e.g. ops, batch onboarding, custodial address provided by you). The "funds will be lost" warning is about typos / wrong addresses — there is no way to recover to the right address if BlindPay mints to the wrong one.

### Option C — Use a BlindPay-managed wallet (no signature, no paste — the cleanest "no UX" option)

This is the one that matters for Vortex if we want to keep the onramp flow signature-free.

> "A wallet is a BlindPay-managed account that lets your customers store stablecoins."
> "You can also receive stablecoins directly into a [BlindPay-managed wallet](https://www.blindpay.com/docs/essentials/wallets#collect-fiat) by using `wallet_id` instead of `blockchain_wallet_id` when creating the payin quote."
> — https://www.blindpay.com/docs/essentials/wallets and https://www.blindpay.com/docs/essentials/payins

Mechanics:
1. We call `POST /v1/.../wallets` for the customer.
2. BlindPay returns an Arbitrum or Polygon address (USDC / USDT / USDB) that BlindPay itself controls on-chain.
3. We pass `wallet_id` (instead of `blockchain_wallet_id`) when creating the payin quote.
4. When the payin settles, BlindPay credits the managed wallet internally.

**The user never signs anything.** We never deal with a wallet library. The user doesn't need a wallet at all to receive USDC/USDT from the onramp.

Trade-offs:
- It is **custodial** at the BlindPay layer (BlindPay holds the private key of that address). This contradicts BlindPay's general "non-custodial" framing of the onchain side, but it is the explicit "Wallets" product.
- The user **cannot** later sweep those funds themselves without a BlindPay → external transfer. If we want the user to truly custody the funds on Pendulum, we then call a transfer/payout to move the funds onward (which means a quote + a payout, and a fee on the way out).
- Limited to **Arbitrum and Polygon only** (USDC and USDT). No Ethereum mainnet, no Base, no Solana, no Pendulum, no Stellar. (https://www.blindpay.com/docs/essentials/wallets)

A second managed option is the **Offramp Wallet**:

> "An offramp wallet is a blockchain wallet that BlindPay creates for you. For every USDC or USDT transaction sent to the wallet, BlindPay automatically converts the funds to fiat and sends them to your bank account."
> — https://www.blindpay.com/docs/essentials/offramp-wallets

Same idea — BlindPay owns the address, we receive it, the user never signs — but it auto-converts to fiat. Useful only for the offramp direction, not for onramp.

### Comparison

| Path | Requires user signature? | Customer controls the private key? | Available chains | Custody model |
|---|---|---|---|---|
| **A. Secure (recommended)** | Yes (EIP-191 `personal_sign`) | Yes | EVM (Eth/Polygon/Base/Arbitrum), Stellar, Solana, Tron | Non-custodial for the user |
| **B. Non-secure** | No | Yes (but address is unverified) | Same as A | Non-custodial, but BlindPay has no proof of ownership |
| **C. BlindPay-managed wallet** | No | No — BlindPay holds the key | Arbitrum, Polygon only (USDC, USDT, USDB) | BlindPay-custodial; onchain funds live with BlindPay until swept |

### Implications for Vortex

- If the Vortex onramp needs to land on Pendulum, none of the above is a clean fit: the supported chains (Eth/Polygon/Base/Arbitrum/Stellar/Solana/Tron) do not include Pendulum/AssetHub. The deposit would land on a supported chain and we'd need an extra bridge/XCM leg.
- If the Vortex onramp is fine landing on EVM (e.g. we accept USDC on Polygon or Arbitrum as the user-facing stable), Option A (sign a message) is the idiomatic match for our existing wagmi/ethers-based UX. It's a one-time, off-chain `signMessage` — no extra popup cost beyond a normal "Sign in" flow.
- If we want **zero signature** at the onramp UX layer, Option C (managed wallet) works but introduces a BlindPay-custodial hold. Option B is technically signature-free but is disclaimed and is probably not what compliance wants to see in production.

---

## 4. Dedicated deposit account + auto-mint without a quote?

**Partially yes.** Per-customer US virtual accounts exist and BlindPay explicitly says deposits auto-generate a payin. But the "no quote" part is ambiguous in the docs and almost certainly only applies to US virtual-account rails; non-US rails are quote-driven.

### What "dedicated deposit account" actually means

> "A virtual account is a dedicated bank account that can be generated for each of your customers. US virtual accounts come with their own unique **routing number** and **account number**, enabling customers to send and receive payments throughout the United States banking system. Brazilian virtual accounts support local payment rails such as PIX."
> — https://www.blindpay.com/docs/essentials/virtual-accounts

Note: BlindPay does **not** use the term "IBAN" anywhere — the US product is `routing + account number`. The Brazil product is PIX-only (no IBAN either; PIX uses a random key / BR Code). If we need real IBAN coverage (e.g. SEPA for EUR), that is **not in scope** here — only USD (US banks) and BRL (PIX).

Available banking partners:

> | Banking Partner | Use Case | Payment Methods | Countries | SLA | Cost |
> | US Bank 1 | Individuals and Businesses | ACH, Wire, SWIFT | US and Foreign | 24 hours | $1.50 / mo per account |
> | US Bank 2 | Businesses | ACH, RTP, Wire, SWIFT | Foreign only | 3–5 business days | $1.50 / mo per account |
> | US Bank 3 | Businesses | ACH, Wire, SWIFT | US only | 3–5 business days | $1.50 / mo per account |
> | Blind Pay LTDA | Individuals and Businesses | PIX, TED, Boleto | Brazil and Foreign | Instant | TBD |
> — https://www.blindpay.com/docs/essentials/virtual-accounts

There is also a two-step approval gate (compliance → bank) and approval is **not guaranteed**:

> "Issuance SLAs vary by virtual account type — see the table above. **Approval is not guaranteed at either stage**; both BlindPay's compliance team and the banking partner reserve the right to reject any application."
> — https://www.blindpay.com/docs/essentials/virtual-accounts

### Do deposits auto-mint without a quote?

**This is the most important sentence in the whole report:**

> "**All incoming payments to a virtual account automatically generate a payin.** Transaction fees are charged on your invoice at the end of each billing cycle."
> — https://www.blindpay.com/docs/essentials/virtual-accounts

That sounds like exactly what we want: a fixed account number, the user can deposit USD at any time, and the system will route the funds to their linked blockchain wallet automatically. No per-deposit quote.

### But the payin doc contradicts this on first read

> "A payin can only be executed if a payin quote was created previously, and you have 5 minutes to initiate the payin before the quote expires."
> — https://www.blindpay.com/docs/essentials/payins

Reading the rest of that page clarifies the two paths:

> "For US payments, customers with enabled [virtual accounts](https://www.blindpay.com/docs/essentials/virtual-accounts) will have their own virtual account details displayed. **For customers without virtual accounts, BlindPay will generate a unique memo code and provide BlindPay's bank account details for the transaction.**"
> — https://www.blindpay.com/docs/essentials/payins

So my reading is:
- **With a virtual account (US only)**: the user has a fixed routing/account number. Funds arriving there *automatically* create a payin server-side. The 5-minute quote TTL is for the non-virtual-account case where BlindPay gives you a single BlindPay-owned account plus a per-deposit memo code.
- **Without a virtual account (all non-US rails, and US as a fallback)**: you must create a `payin_quote` and then a `payin` within 5 minutes, and the sender uses BlindPay's pooled bank account with a unique `memo_code`.

This is also consistent with the settlement-time table, which lists `memo_code` and `blindpay_bank_details` separately from the virtual-account flow.

### The destination still must be a signed blockchain wallet

Auto-mint is to the customer's registered blockchain wallet — which has to be added (and signed) up front, as established in §3. So the real "deposit anytime, mint anytime" prerequisite chain is:

1. Customer exists and is `approved`.
2. Customer has a signed blockchain wallet.
3. Customer has an `approved` virtual account (US or Brazil PIX only).
4. User wires/ACHs/PIXes USD/BRL to that account. BlindPay detects the credit and mints USDC/USDT to the wallet.

### Limits to flag

- **Per-customer transfer limits** apply even with a virtual account:

  > "Transfer limits are calculated on the stablecoin amount transferred. Each customer has separate limits for payouts (sending) and payins (receiving). | Per transaction: KYC Standard $10k, KYB Standard $30k, KYC Enhanced $50k | Daily: $50k / $100k / $100k | Monthly: $100k / $250k / $500k"
  > — https://www.blindpay.com/docs/essentials/customers

  These can be raised via the `…/customers/{customer_id}/limit-increase` endpoint.

- **Settlement times** for US ACH/Wire are 5 business days, which is a flow-level concern, not a permission concern. (https://www.blindpay.com/docs/essentials/payins)

### Things to confirm with BlindPay sales / support

- Confirm that the "auto-generates a payin" path on US virtual accounts does **not** require our backend to call `POST /v1/.../payin-quotes` first — the docs strongly imply this but don't say it explicitly.
- Confirm whether the auto-mint on a virtual-account deposit respects a pre-set "destination wallet" (the one we signed in §3) or whether the user can pick a wallet at deposit time. Reading the docs, only the pre-registered wallet is mentioned.
- Ask whether a US Bank 2/3 virtual account (3–5 business day SLA) can still auto-mint on receipt, or whether that gating is only available on US Bank 1 (24h SLA).
- Ask about EUR / SEPA / SWIFT-only corridors if we need IBAN coverage. The current partner matrix only lists US banks + Brazilian PIX.

---

## 5. Europe — SEPA, IBAN, virtual accounts, EUR deposits

**Short answer: there is no dedicated European deposit account (no IBAN, no SEPA virtual account) today. SEPA is officially on the roadmap but listed as `(soon)`. Right now, the only way to move EUR into BlindPay is via international SWIFT, which is not a "deposit anytime to a fixed account" model.**

### What the docs say about SEPA

From the Supported Countries knowledge-base guide, the supported payment-methods table explicitly lists:

> | Type | Country/Region |
> | International SWIFT | Global |
> | ACH | United States |
> | Wire | United States |
> | RTP | United States |
> | Pix | Brazil |
> | SPEI | Mexico |
> | PSE | Colombia |
> | Transfers 3.0 | Argentina |
> | **SEPA** | **Europe (soon)** |
> | **Instant Payments** | **United Kingdom (soon)** |
> — https://www.blindpay.com/knowledge-base/guides/supported-countries

The `(soon)` suffix appears on both SEPA and UK Instant Payments. There is no ETA on the page.

### Virtual-account matrix confirms: no European banking partner

The Virtual Accounts page lists the four banking partners BlindPay is integrated with. There is no EU bank in the list:

> | Banking Partner | Use Case | Payment Methods | Countries | SLA | Cost |
> | US Bank 1 | Individuals and Businesses | ACH, Wire, SWIFT | US and Foreign | 24 hours | $1.50 / mo per account |
> | US Bank 2 | Businesses | ACH, RTP, Wire, SWIFT | Foreign only | 3–5 business days | $1.50 / mo per account |
> | US Bank 3 | Businesses | ACH, Wire, SWIFT | US only | 3–5 business days | $1.50 / mo per account |
> | Blind Pay LTDA | Individuals and Businesses | PIX, TED, Boleto | Brazil and Foreign | Instant | TBD |
> — https://www.blindpay.com/docs/essentials/virtual-accounts

So there is no per-customer European IBAN to deposit EUR into, full stop. The closest things are:
- the three US banks' "Foreign" rail for US Bank 1 (SWIFT) and US Bank 2 (RTP) — but those are USD USD USD, denominated in USD even if the originator is foreign;
- and Brazil's PIX account (BRL only).

### What you can do today with European counterparties

You can add a European bank account as a **payee** for a payout (offramp direction, not onramp). The Bank Accounts page lists the available payout rails:

> | Type | Country | Estimated time of arrival |
> | international_swift | 🌎 Global | ~5 business days |
> | ach | 🇺🇸 United States | ~2 business days |
> | wire | 🇺🇸 United States | ~1 business day |
> | rtp | 🇺🇸 United States | instant |
> | pix | 🇧🇷 Brazil | instant |
> | spei_bitso | 🇲🇽 Mexico | instant |
> | ach_cop_bitso | 🇨🇴 Colombia | ~1 business day |
> | transfers_bitso | 🇦🇷 Argentina | instant |
> — https://www.blindpay.com/docs/essentials/bank-accounts

So a European beneficiary can be paid via `international_swift` (USD or the local currency, depending on the account), but the **onramp** side (fiat → USDC) has no European rail.

### Important friction on the SWIFT payout side (for the offramp-to-EU case)

Even where SWIFT is available, every B2B SWIFT payout requires a compliance document per transfer:

> "Every B2B payment sent through SWIFT requires a transaction document showing the **relationship between the sender and the customer**."
> "BlindPay accepts the following transaction documents: Invoice, Purchase Order, Delivery Slip, Contract, Customs Declaration, Bill of Lading, Others."
> "**Important**: If the document doesn't show the relationship between the sender and the customer, the payment will be rejected."
> — https://www.blindpay.com/knowledge-base/guides/swift-deliverability

And the payout is placed `on_hold` until BlindPay's compliance team approves the document:

> "When you create a [SWIFT payout](https://www.blindpay.com/docs/essentials/payouts), the flow is: 1. **Payout created** → Status is `on_hold` 2. **Waiting for documents** → `tracking_documents.status: waiting_documents` 3. **Documents submitted** → `tracking_documents.status: compliance_reviewing` 4. **Compliance approved** → Payout proceeds to `processing`, fiat is sent"
> — https://www.blindpay.com/knowledge-base/guides/swift-statuses

Timeouts:

> "Document submission: 30 days from payout creation. Compliance review: 8 days from document submission."
> — https://www.blindpay.com/knowledge-base/guides/swift-statuses

So a EU offramp is not "send USDC, EUR lands in 1 business day" — it is "send USDC, upload an invoice, wait up to 8 days for compliance review, then another ~5 business days for the SWIFT wire to land."

### EU countries are onboardable, just not funded via SEPA

All major EU countries (DE, FR, ES, IT, NL, BE, AT, PT, IE, FI, GR, etc.) appear as `Supported` in the country-risk table, so EU-domiciled customers can be KYC'd and onboarded:

> "Austria — Supported, Belgium — Supported, Bulgaria — Supported, Croatia — Supported, Cyprus — Supported, Czech Republic (Czechia) — Supported, Denmark — Supported, Estonia — Supported, Finland — Supported, France — Supported, Germany — Supported, Greece — Supported, Hungary — Supported, Ireland — Supported, Italy — Supported, Latvia — Supported, Lithuania — Supported, Luxembourg — Supported, Malta — Supported, Netherlands — Supported, Poland — Supported, Portugal — Supported, Romania — Supported, Slovakia — Supported, Slovenia — Supported, Spain — Supported, Sweden — Supported"
> — https://www.blindpay.com/knowledge-base/guides/supported-countries

The gap is only on the **payment rails**, not on the customer-jurisdiction side.

### Implication for Vortex

If we are considering BlindPay as a way to accept EUR from European counterparties into USDC/USDT, **today this is not possible** without going through a US virtual account (USD only) or a Brazilian virtual account (BRL only). The right path forward is one of:

- Wait for SEPA / UK Instant Payments to ship. Ask BlindPay sales for a concrete ETA, since the docs only say `(soon)`.
- Add a fiat-→-stable leg in front of BlindPay for EUR (e.g. accept SEPA on our side, mint USDC ourselves, then push into BlindPay as a BlindPay-managed wallet credit) — but this defeats the point of using BlindPay for the EUR leg.
- Use BlindPay for non-EUR corridors only (US/Brazil/Mexico/Argentina/Colombia) until SEPA is live.

---

## Summary table

| Question | Answer | Confidence | Citation |
|---|---|---|---|
| Headless KYC/KYB (we send docs, not a hosted link) | **Yes** | High | customers, upload, rfi pages |
| Sumsub / equivalent KYC reuse or sharing | **No** | High (nothing in docs; needs sales confirmation only for a "partner reuse" program, if one exists privately) | kyc-basics, customers, rfi |
| On-chain address binding needs a signature | **Yes on the recommended (secure) path** — EIP-191 `personal_sign`, one-time, no on-chain tx. **No signature** if you use the disclaimed non-secure path **or** a BlindPay-managed wallet (option C) | High | blockchain-wallets, wallets |
| Dedicated per-customer deposit account that auto-mints without a quote | **Yes for US (ACH/Wire/SWIFT) and Brazil (PIX) virtual accounts**; non-virtual-account path is quote-driven and per-deposit | Medium-High (docs imply it; needs sales confirmation on the "no quote needed" wording) | virtual-accounts, payins |
| Europe — dedicated EUR / SEPA / IBAN account | **No.** SEPA is listed as `(soon)`. Only `international_swift` reaches Europe today, with per-payout compliance documents and ~5 business day ETA | High (explicitly stated in the supported-countries table) | supported-countries, virtual-accounts, bank-accounts, swift-deliverability, swift-statuses |

---

## Sources

All quotes and citations in this report come from the following BlindPay docs pages (all fetched 2026-07-07):

- Overview — https://www.blindpay.com/docs/getting-started/overview
- Stable to fiat quickstart — https://www.blindpay.com/docs/getting-started/quick-start
- Fiat to stable quickstart — https://www.blindpay.com/docs/getting-started/quick-start-payin
- Customers — https://www.blindpay.com/docs/essentials/customers
- RFI — https://www.blindpay.com/docs/essentials/rfi
- Instance RFI — https://www.blindpay.com/docs/essentials/instance-rfi
- Upload — https://www.blindpay.com/docs/essentials/upload
- Analyze Document — https://www.blindpay.com/docs/essentials/analyze-document
- Blockchain Wallets — https://www.blindpay.com/docs/essentials/blockchain-wallets
- Wallets (managed) — https://www.blindpay.com/docs/essentials/wallets
- Offramp Wallets — https://www.blindpay.com/docs/essentials/offramp-wallets
- Payin Quote — https://www.blindpay.com/docs/essentials/payin-quotes
- Payins — https://www.blindpay.com/docs/essentials/payins
- Payout Quote — https://www.blindpay.com/docs/essentials/payout-quotes
- Payouts — https://www.blindpay.com/docs/essentials/payouts
- Bank Accounts — https://www.blindpay.com/docs/essentials/bank-accounts
- Virtual Accounts — https://www.blindpay.com/docs/essentials/virtual-accounts
- Transfer Quote — https://www.blindpay.com/docs/essentials/transfer-quotes
- Transfers — https://www.blindpay.com/docs/essentials/transfers
- Supported Chains — https://www.blindpay.com/knowledge-base/guides/supported-chains
- Supported Countries — https://www.blindpay.com/knowledge-base/guides/supported-countries
- KYC Basics — https://www.blindpay.com/knowledge-base/guides/kyc-basics
- SWIFT Deliverability — https://www.blindpay.com/knowledge-base/guides/swift-deliverability
- SWIFT Statuses — https://www.blindpay.com/knowledge-base/guides/swift-statuses
- Smart Contracts — https://www.blindpay.com/knowledge-base/guides/smart-contracts
- Virtual Accounts best practices (KB) — https://www.blindpay.com/knowledge-base/guides/virtual-account-best-practices
