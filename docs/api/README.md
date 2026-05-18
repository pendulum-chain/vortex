# Vortex API Docs Source

This directory is the repository source of truth for the partner-facing Vortex API docs.

## Structure

- `openapi/vortex.openapi.json` is the OpenAPI reference used for the Apidog endpoint catalog.
- `pages/*.md` contains the pure Markdown guide pages that sit around the endpoint reference.
- `apidog/page-manifest.json` records the intended page order, source files, current Apidog project ID, and endpoint grouping decisions.

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

## Publishing To Apidog

Apidog's documented Git connection currently targets OpenAPI/Swagger files. Use it for `docs/api/openapi/vortex.openapi.json`.

The Markdown guide pages are tracked here so they can be reviewed in normal Git diffs. Until Apidog exposes documented Git sync or CRUD APIs for pure Markdown pages, import or paste those pages into Apidog intentionally and keep `apidog/page-manifest.json` updated when the page order changes.

## Type Generation Direction

The current short-term path is OpenAPI first: keep `vortex.openapi.json` reviewed, then run `bun run docs:api:types` to generate `vortex.openapi.d.ts` with `openapi-typescript`.

The likely long-term path is schema first: move API request and response contracts into a single TypeScript schema source, such as Zod or TypeBox, and generate both runtime validators and OpenAPI from that source. That would reduce drift between `@vortexfi/shared`, the API controllers, the SDK, and Apidog, but it is a larger refactor than this docs bootstrap.

## Scope Rules

The endpoint reference should stay SDK-led and partner-facing. Preserve currently documented Apidog endpoints unless we intentionally decide to remove one. Do not add internal routes just because they exist in the API server.

The docs must strongly state that Vortex does not receive, store, or reconstruct ephemeral account secret keys. The SDK or direct API client is responsible for keeping those secrets available until the ramp and any recovery window are complete.
