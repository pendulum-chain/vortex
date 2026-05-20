# Vortex API Docs Source

This directory is the repository source of truth for the partner-facing Vortex API docs.

## Structure

- `openapi/vortex.openapi.json` is the OpenAPI reference used for the Apidog endpoint catalog.
- `pages/*.md` contains the pure Markdown guide pages that sit around the endpoint reference.
- `apidog/page-manifest.json` records the intended page order, source files, current Apidog project ID, and endpoint grouping decisions.
- `scripts/*.ts` contains the local export, validation, and type-generation helpers for this docs source.

## Daily Workflow

Edit endpoint reference content in `docs/api/openapi/vortex.openapi.json` and guide copy in `docs/api/pages/*.md`.

Run the docs check before publishing:

```bash
bun run docs:api:check
```

Generate TypeScript declarations from the OpenAPI file when endpoint schemas change:

```bash
bun run docs:api:types
```

Refresh the local OpenAPI file from Apidog when Apidog has changed and should become the new baseline:

```bash
bun run docs:api:export
```

`docs:api:export` reads `APIDOG_ACCESS_TOKEN` from the environment or from `apps/api/.env`. It never prints the token.

## Apidog Access

The Apidog project ID is recorded in `apidog/page-manifest.json`. The export script defaults to that same project and can be overridden with `--project-id`.

Keep the Apidog token in `apps/api/.env` as `APIDOG_ACCESS_TOKEN`, or provide it through the shell environment. Never paste the token into docs, source files, logs, screenshots, support tickets, or command output. If it is accidentally printed, rotate it before publishing further docs changes.

The export script calls Apidog's official OpenAPI export endpoint with `X-Apidog-Api-Version: 2024-03-28`. It is safe to use for read-only refreshes:

```bash
bun run docs:api:export
```

## Page Conventions

- Markdown filenames are numbered (`01-overview.md`, `02-...`) to preserve repo ordering, but page H1 titles **must not** be numbered. Apidog renders H1 as the page title and is responsible for ordering through the manifest.
- Use fenced code blocks with `js` (not `ts`). Apidog's renderer does not highlight `ts` reliably; `js` is rendered consistently for both plain JavaScript and TypeScript snippets.
- Cross-page links between Markdown docs must use the **deterministic published URL** with a custom Apidog slug: `https://api-docs.vortexfinance.co/<slug>`. Relative `.md` links break on import because Apidog assigns its own page IDs and does not parse Markdown frontmatter.
- The slug for each page must be set once in Apidog (Page → SEO Settings → URL Slug) to match the manifest `slug` field. Without a custom slug, Apidog auto-suffixes the URL (e.g. `/webhooks-1648582m0`) and links become fragile.

The current slug-to-source mapping is the `slug` field in `apidog/page-manifest.json`. Keep them aligned with the published Apidog pages.

## Publishing To Apidog

Apidog's documented Git connection currently targets OpenAPI/Swagger files. Use it for `docs/api/openapi/vortex.openapi.json`.

The Markdown guide pages are tracked here so they can be reviewed in normal Git diffs. Until Apidog exposes documented Git sync or CRUD APIs for pure Markdown pages, import or paste those pages into Apidog intentionally and keep `apidog/page-manifest.json` updated when the page order changes.

Do not import an updated OpenAPI file into Apidog without an explicit human review of the path summary and secret scan results. Apidog's documented OpenAPI import flow expects a remotely reachable HTTPS URL, so local files under `/private/tmp` are not directly reachable by Apidog cloud.

Apidog sprint branches are supported in the UI, but the public OpenAPI import/export API does not clearly document a branch selector. If a sprint branch is required, generate the local OpenAPI file here and import it manually into the desired branch through the Apidog UI.

## Type Generation Direction

The current short-term path is OpenAPI first: keep `vortex.openapi.json` reviewed, then run `bun run docs:api:types` to generate `vortex.openapi.d.ts` with `openapi-typescript`.

The likely long-term path is schema first: move API request and response contracts into a single TypeScript schema source, such as Zod or TypeBox, and generate both runtime validators and OpenAPI from that source. That would reduce drift between `@vortexfi/shared`, the API controllers, the SDK, and Apidog, but it is a larger refactor than this docs bootstrap.

## Scope Rules

The endpoint reference should stay SDK-led and partner-facing. Preserve currently documented Apidog endpoints unless we intentionally decide to remove one. Do not add internal routes just because they exist in the API server.

The docs must strongly state that Vortex does not receive, store, or reconstruct ephemeral account secret keys. The SDK or direct API client is responsible for keeping those secrets available until the ramp and any recovery window are complete.

Do not add `subsidize`, `moonbeam`, or `pendulum` route files to the public docs just because they exist on disk. Also keep auth, SIWE, metrics, prices, maintenance, admin, and other first-party/internal routes out of the partner docs unless their inclusion is explicitly approved.

`GET /v1/public-key` returns the RSA-PSS webhook verification key. It is unrelated to partner `pk_*` public keys.

The public Sandbox page previously exposed a shared test-wallet recovery phrase. Do not restore shared recovery phrases, seed phrases, mnemonics, private keys, or real API keys to any generated docs. Use placeholder values such as `sk_live_...` and `pk_live_...` when examples need key-shaped strings.
