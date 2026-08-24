import { FiatToken, VortexSdk } from "@vortexfi/sdk";

const sdk = new VortexSdk({
  accessTokenProvider: async () => "current-access-token",
  apiBaseUrl: "https://api-sandbox.vortexfinance.co",
  offrampFundingMode: "deferred",
  storeEphemeralKeys: false
});

type RampInfo = Awaited<ReturnType<typeof sdk.getRampInfo>>;
const assertRampInfo = (info: RampInfo): boolean => Boolean(info.corridors);

void FiatToken.BRL;
void assertRampInfo;
