# Proposal: A Vortex MCP Server

**Status:** Discussion draft — not yet an ADR.
**Audience:** Vortex tech team.
**TL;DR:** We propose shipping an official Vortex MCP server so that AI coding agents
(Claude Code, Cursor, claude.ai, etc.) can integrate and operate Vortex directly. Two
variants share one codebase: a **hosted server** (docs, quotes, status, integration
recipes — no credentials) and a **local npm package** (wraps `@vortexfi/sdk`, holds the
partner's keys, can execute ramps). We recommend starting with the **hosted server**.

---

## 1. What is MCP, in one minute

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard
(originated by Anthropic, now industry-wide) that lets AI agents call external
capabilities. An MCP **server** exposes:

- **Tools** — functions the agent can call (JSON-schema input, structured output).
- **Resources** — readable content (e.g. docs pages).
- **Prompts** — invocable templates (e.g. "walk me through my first offramp").

Clients include Claude Code, claude.ai, Cursor, Windsurf, Copilot, ChatGPT dev tools —
i.e. the tools our integration partners' developers already use. Two transports matter:

| Transport | Where it runs | Typical use |
|---|---|---|
| **stdio** | Spawned as a child process on the user's machine (e.g. via `npx`) | Developer tooling; credentials stay local |
| **Streamable HTTP** | Hosted by us at a URL | No install; reachable from web clients (claude.ai etc.); we update it for everyone at once |

(The older HTTP+SSE transport is deprecated — new remote servers use Streamable HTTP.)

## 2. Why Vortex should ship one

- **Our funnel is developer integrations.** Every partner goes through
  quotes → register → sign → start → webhooks, with real gotchas (string decimals,
  5 presigned tx variants, `FiatToken.EURC` vs `EUR`, deprecated `taxId`, user-linked
  `sk_*` keys). Today an AI agent only gets this right if the developer happens to feed
  it our docs. MCP makes Vortex *operable* by the agent, not just readable.
- **We already committed to this channel.** The `vortex-integration` skill and the
  "AI Agent Integration" docs page exist. MCP is the client-agnostic distribution
  surface for the same content — the skill is Claude-Code-shaped; MCP works everywhere.
- **Live feedback loop.** The killer feature is not docs search: the agent can call
  sandbox *while writing integration code* — get a real quote, register a test ramp,
  poll status, see the actual error payload. That collapses the integrate–debug loop.
- **Discoverability.** The official [MCP Registry](https://registry.modelcontextprotocol.io/)
  is becoming how AI-native developers find integrable services (Stripe, Cloudflare,
  PayPal ship servers). A verified `co.vortexfinance/*` listing is distribution and
  marketing, and domain-verified namespacing prevents someone publishing a fake
  "Vortex" server.

## 3. The two variants

Both variants are **public** and target the same audience — partner developers
integrating Vortex into *their* applications. The difference is where the server runs
and, consequently, what it is allowed to do. They are **one codebase with two entry
points**: the MCP SDK makes the transport swappable, so tool definitions are written
once. The hosted server is a strict subset (read-only + recipes); the local package
adds the credentialed tools on top.

### 3.1 Hosted server — `https://mcp.vortexfinance.co/mcp` (recommended first)

Streamable HTTP, **no credentials, no secrets ever transit it**. Its job is
zero-friction discovery, integration guidance, and safe read operations.

**Tool catalog:**

| Tool | What it does |
|---|---|
| `list_corridors` / `get_corridor` | Live corridors: currencies, rails, networks, limits, availability |
| `create_quote` | Price discovery (safe unauthenticated — a quote moves no funds) |
| `get_ramp_status` | Read-only status by ramp ID, with a human-readable rendering of the phase state machine ("stuck at `nablaSwap`, which means …") |
| `explain_error` | Error code → cause → fix (support deflection) |
| `search_docs` | Search over the integration docs |
| `get_integration_recipe` | **The instruction pattern — see below** |

Plus **resources** (each docs page exposed as a readable resource) and **prompts**
(e.g. an "integrate your first offramp" walkthrough).

**The instruction pattern.** The hosted server cannot hold keys or sign, so for
anything transactional it returns a *plan for the calling agent to execute locally*
with the user's own credentials. Example response from
`get_integration_recipe({ task: "offramp-brl-pix" })`:

```markdown
# Recipe: SELL USDC → BRL via PIX

You (the agent) will implement this in the user's project. Their keys never come
to this server.

1. `npm i @vortexfi/sdk` — do NOT call the REST API raw; the SDK handles the
   presigned tx variants.
2. Read VORTEX_SECRET_KEY from env. Never hardcode it. Must be a user-linked sk_* key.
3. Quote first — amounts are STRINGS, never JS Number.
4. Check quote.expiresAt before registering; re-quote if stale.
5. registerRamp → submitUserTransactions for wallet-owned txs → startRamp.

Common pitfalls: EUR is FiatToken.EURC; do not send taxId for BRL (derived server-side).
```

The hosted server is effectively **living documentation plus a planner**: it answers,
prices, and diagnoses directly; for privileged operations it hands back current,
correct instructions. This is the `vortex-integration` skill served over the network —
always current, reachable from any MCP client including claude.ai.

**Why hosted first:**

- Zero install; works from web clients (claude.ai, ChatGPT) that cannot spawn processes.
- **No version skew**: we deploy once, every user is current at their next session.
  Clients fetch the tool list at runtime, so we can add/change/retire tools and every
  connected client sees it immediately. Users never "keep up with" our releases.
- Eligible for curated directories (e.g. the claude.ai connector directory, which only
  accepts remote servers).

### 3.2 Local npm package — `@vortexfi/mcp` (phase 2)

A stdio server published to npm, spawned by the developer's MCP client. It is a thin
MCP layer over `@vortexfi/sdk`: keys come from env vars and **never leave the
developer's machine**; the SDK does what it already does (ephemeral key generation,
the 5-presigned-variant construction, signing). Filesystem access is used for one
thing: persisting ephemeral keys and ramp state to `~/.vortex/` so a crashed session
can recover a ramp (mirrors the SDK's storage concept).

**Additional tools on top of the hosted set:**

| Tool | What it does |
|---|---|
| `register_ramp` | Register from a non-expired quote; generates ephemerals, builds presigned variants, persists recovery state; returns `rampId` + any transactions the *user's wallet* must sign |
| `start_ramp` | Start a registered ramp |
| `recover_ramp` | Resume from persisted state in `~/.vortex/` |
| sandbox variants | Same flows against `api-sandbox.vortexfinance.co` for integration testing |

**Developer setup** is one config block:

```json
{ "mcpServers": { "vortex": {
    "command": "npx", "args": ["-y", "@vortexfi/mcp@latest"],
    "env": { "VORTEX_SECRET_KEY": "sk_test_..." }
} } }
```

**Example agent session:**

```text
Agent → create_quote   {"direction":"SELL","inputCurrency":"usdc",
                        "outputCurrency":"brl","inputAmount":"100","network":"polygon"}
     ←                 {"quoteId":"q_8f2...","outputAmount":"512.34","expiresAt":"..."}

Agent → register_ramp  {"quoteId":"q_8f2...","destinationAddress":"0xAb5..."}
     ←                 {"rampId":"r_c91...","userActionsRequired":1}
                       (ephemerals generated + presigned locally, state saved to disk)

Agent → start_ramp     → {"phase":"prepareTransactions"}
Agent → get_ramp_status (polls; renders phase in plain English)
```

The security property: all dangerous mechanics (`sk_*` custody, ephemeral keys, the
presigned-variant rule) happen inside a process on the user's machine, invisible to
the agent and never sent to us.

**Code sketch** (illustrative — real names match the `VortexSdk` surface:
`createQuote`, `registerRamp`, `startRamp`, `getRampStatus`, `submitUserTransactions`):

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VortexSdk } from "@vortexfi/sdk";
import { z } from "zod";

const vortex = new VortexSdk({
  apiBaseUrl: process.env.VORTEX_API_URL ?? "https://api.vortexfinance.co",
  publicKey: process.env.VORTEX_PUBLIC_KEY!,
  secretKey: process.env.VORTEX_SECRET_KEY!   // never leaves this machine
});

const server = new McpServer({ name: "vortex", version: "0.1.0" });

server.registerTool("create_quote", {
  description: "Price an onramp/offramp. Amounts are decimal strings. EUR uses EURC.",
  inputSchema: {
    direction: z.enum(["BUY", "SELL"]),
    inputCurrency: z.string(), outputCurrency: z.string(),
    inputAmount: z.string(), network: z.string()
  }
}, async (args) => {
  const quote = await vortex.createQuote({ rampType: args.direction, ...args });
  return { content: [{ type: "text", text: JSON.stringify(quote) }] };
});

// register_ramp, start_ramp, get_ramp_status, recover_ramp, list_corridors ...
await server.connect(new StdioServerTransport());
```

**Staleness — how bad is it?** Less bad than it sounds:

- The recommended config uses `npx @vortexfi/mcp@latest`, which pulls the newest
  version at launch — most users are effectively evergreen (caveats: pinned versions,
  npx cache lag, offline machines).
- Design the server **thin**: don't bundle recipes/corridor data — fetch them from the
  API at runtime, so an old package still returns current answers. Only code (tool
  schemas, bundled SDK, signing logic) can ossify.
- That code-layer skew is exactly the compat obligation we already carry for pinned
  `@vortexfi/sdk` versions. The local MCP server inherits it; it doesn't create a new one.

## 4. Distribution

1. Hosted server goes live at `mcp.vortexfinance.co` (Streamable HTTP).
2. Publish metadata to the official **MCP Registry**
   (self-serve via their publisher CLI; API is stability-frozen at v0.1). Claim the
   `co.vortexfinance/*` namespace via domain verification.
3. Later: publish `@vortexfi/mcp` to npm and add it to the same registry entry.
4. Optional: submit the hosted server to curated directories (claude.ai connectors).

## 5. Risks and constraints

- **Surface sync.** This adds a fourth surface that must stay in sync: SDK, api-docs
  (Apidog/OpenAPI), the `vortex-integration` skill, and MCP. Mitigation: generate tool
  schemas from the OpenAPI spec / SDK types, and source recipe content from the same
  files as the skill. Extend the existing "keep the skill in sync" rule in
  `packages/sdk/CLAUDE.md` to cover MCP.
- **Whitelabeling.** The api-docs whitelabel rule applies to everything the MCP server
  returns (tool output, recipes, error explanations) — provider names must not leak.
- **Money-moving tools and agent safety.** MCP clients enforce safety rules around
  fund transfers; agents will (correctly) require human confirmation for transactional
  tools. Design for it: idempotency keys, explicit confirmation-oriented tool
  descriptions, sandbox-by-default. Production transactional tools are a deliberate
  phase-2/3 decision, not a default.
- **Prompt injection.** Tool outputs are consumed by agents; anything user-influenced
  that we echo back (e.g. error messages containing user input) should be treated as
  data, not instructions, and sanitized where feasible.

## 6. Recommended phasing

| Phase | Scope | Effort |
|---|---|---|
| **1 — Hosted server** | `list_corridors`, `create_quote`, `get_ramp_status`, `explain_error`, `search_docs`, `get_integration_recipe` + resources/prompts; registry listing | Small — thin layer over existing API + skill content |
| **2 — Local npm package** | Same codebase + credentialed tools (`register_ramp`, `start_ramp`, `recover_ramp`), sandbox-first | Small–medium — mostly SDK wiring + key/state handling |
| **3 — Production transactional (evaluate)** | Real-money ramps via the local server with confirmation UX | Decide after observing phase 1–2 usage |
| **Side quest — internal ops server** | Private server over admin endpoints (ramps stuck in a phase, partner volume, rebalancer state) for our own support/on-call Claude sessions | Independent; possibly the fastest ROI |

## 7. Open questions

- Primary audience for phase 3: partner developers, or end-user agents ("agentic
  payments")? These imply different auth models (API keys vs OAuth).
- Should the hosted server require a lightweight (free) key for `create_quote` to
  enable rate limiting/attribution, or stay fully open?
- Where does the server live — `packages/mcp` in this monorepo (shares SDK + skill
  sources directly) or a separate repo?
