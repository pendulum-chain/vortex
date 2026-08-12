import { FiatToken, VortexSdk } from "../../dist/index.js";

const sdk = new VortexSdk({
  apiBaseUrl: "https://api-sandbox.vortexfinance.co",
  offrampFundingMode: "deferred",
  storeEphemeralKeys: false
});

type RampInfo = Awaited<ReturnType<typeof sdk.getRampInfo>>;
const assertRampInfo = (info: RampInfo): boolean => Boolean(info.corridors);

void FiatToken.BRL;
void assertRampInfo;
