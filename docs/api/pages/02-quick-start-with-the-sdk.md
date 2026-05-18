# 2. Quick Start With The SDK

Install the SDK:

```bash
npm install @vortexfi/sdk
```

Initialize it:

```ts
import { VortexSdk, FiatToken, EvmToken, Networks, RampDirection } from "@vortexfi/sdk";
import type { VortexSdkConfig } from "@vortexfi/sdk";

const config: VortexSdkConfig = {
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: "pk_live_...",
  secretKey: "sk_live_...",
  storeEphemeralKeys: true
};

const sdk = new VortexSdk(config);
```

`publicKey` is attached to quote requests for partner attribution and discount eligibility. `secretKey` is sent as the `X-API-Key` header on authenticated requests. Secret keys must only be used in trusted server-side environments.

Create a quote:

```ts
const quote = await sdk.createQuote({
  rampType: RampDirection.BUY,
  from: "pix",
  to: Networks.Polygon,
  inputAmount: "150000",
  inputCurrency: FiatToken.BRL,
  outputCurrency: EvmToken.USDC
});
```

Register the ramp:

```ts
const { rampProcess } = await sdk.registerRamp(quote, {
  destinationAddress: "0x1234567890123456789012345678901234567890",
  taxId: "12345678900"
});
```

For BRL buy flows, the ramp process may contain a PIX payment payload:

```ts
console.log(rampProcess.depositQrCode);
```

After the user completes the fiat payment, start the ramp:

```ts
const startedRamp = await sdk.startRamp(rampProcess.id);
```

Poll status or use webhooks:

```ts
const status = await sdk.getRampStatus(rampProcess.id);
```

## Why The SDK Is Preferred

The SDK creates fresh ephemeral accounts for each ramp, signs the transactions returned by Vortex, submits required update calls, and can store a local backup of ephemeral secrets. This removes several integration risks from partner applications.

If you disable SDK key storage with `storeEphemeralKeys: false`, your application must provide an equivalent secure backup mechanism.

The default local backup is a JSON file named `ephemerals_{rampId}.json` written to the Node process's current working directory. Treat that file as sensitive key material. It is not encrypted by the SDK, so production integrations should run from a restricted directory, encrypt the file themselves, or disable `storeEphemeralKeys` and provide a custom secure store.

---
