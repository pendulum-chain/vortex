# Published Node Consumer

This private example consumes the `next` release of `@vortexfi/sdk`, compiles with strict NodeNext settings, and runs the emitted JavaScript with Node.

```bash
cd packages/sdk/examples/node-consumer
bun install --frozen-lockfile
bun run check
```

`check` reports the installed SDK version and verifies its Node-only secret-key configuration without making an API request. An anonymous sandbox quote needs no credentials:

```bash
bun run quote
```

For authenticated checks, copy `.env.example` to `.env` and set either `VORTEX_SECRET_KEY` or `VORTEX_ACCESS_TOKEN`. Do not commit or paste credentials into command arguments, logs, or support messages.

```bash
bun run ramp-info # API key only
bun run status    # secret key or Supabase access token; requires RAMP_ID
```

The access-token option is intentionally static for a short manual check. A long-running Node integration should provide renewable session logic or use a server-side secret credential.

The complete corridor examples also import the published `@vortexfi/sdk` package and run their compiled output with Node:

```bash
bun run example:brl-onramp
bun run example:brl-offramp
bun run example:eur-onramp
bun run example:eur-offramp
bun run example:mxn-onramp
bun run example:mxn-offramp
```
