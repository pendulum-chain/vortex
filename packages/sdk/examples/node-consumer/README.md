# Local Node Consumer

This private example consumes the local `@vortexfi/sdk` through Bun's package-link mechanism instead of importing SDK source files. Every command rebuilds the linked SDK, compiles this project with strict NodeNext settings, and runs the emitted JavaScript with Node.

```bash
cd packages/sdk/examples/node-consumer
bun run bootstrap
bun run check
```

`bootstrap` registers `packages/sdk` as the local `@vortexfi/sdk` package and links it into this project. Later SDK patches are picked up automatically; the example commands rebuild the linked package before execution.

`check` verifies the local package export and Node-only secret-key configuration without making an API request. An anonymous sandbox quote needs no credentials:

```bash
bun run quote
```

For authenticated checks, copy `.env.example` to `.env` and set either `VORTEX_SECRET_KEY` or `VORTEX_ACCESS_TOKEN`. Do not commit or paste credentials into command arguments, logs, or support messages.

```bash
bun run ramp-info # API key only
bun run status    # secret key or Supabase access token; requires RAMP_ID
```

The access-token option is intentionally static for a short manual check. A long-running Node integration should provide renewable session logic or use a server-side secret credential.

The complete corridor examples also import the linked `@vortexfi/sdk` package and run their compiled output with Node:

```bash
bun run example:brl-onramp
bun run example:brl-offramp
bun run example:eur-onramp
bun run example:eur-offramp
bun run example:mxn-onramp
bun run example:mxn-offramp
```
