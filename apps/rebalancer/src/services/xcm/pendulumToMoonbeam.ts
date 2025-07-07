import type { PendulumCurrencyId } from "../../tokens";
import ApiManager from "../../utils/api-manager.ts";

export const MOONBEAM_XCM_FEE_GLMR = "50000000000000000";

export async function createPendulumToMoonbeamTransfer(
  destinationAddress: string,
  rawAmount: string,
  currencyId: PendulumCurrencyId
) {
  const currencyFeeId = { XCM: 6 };
  const destination = {
    V3: {
      interior: {
        X2: [{ Parachain: 2004 }, { AccountKey20: { key: destinationAddress, network: undefined } }]
      },
      parents: 1
    }
  };
  const pendulumApi = await ApiManager.getApi("pendulum");
  // @ts-ignore
  return pendulumApi.tx.xTokens.transferMulticurrencies(
    [
      [currencyId, rawAmount],
      [currencyFeeId, MOONBEAM_XCM_FEE_GLMR] // TODO must be fetched.
    ],
    1,
    destination,
    "Unlimited"
  );
}
