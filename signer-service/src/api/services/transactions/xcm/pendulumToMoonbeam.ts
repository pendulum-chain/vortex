import { MOONBEAM_XCM_FEE_GLMR, PendulumCurrencyId } from "shared";
import { ApiManager } from "../../pendulum/apiManager";

// We send a fixed fee amount of 0.05 GLMR.
export async function createPendulumToMoonbeamTransfer(
  destinationAddress: string,
  rawAmount: string,
  currencyId: PendulumCurrencyId
) {
  const currencyFeeId = { XCM: 6 };
  const destination = {
    V2: {
      parents: 1,
      interior: {
        X2: [
          { Parachain: 2004 },
          { AccountKey20: { key: destinationAddress, network: "Any" } },
        ],
      },
    },
  };
  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const { ss58Format, api: pendulumApi } = pendulumNode;

  return pendulumApi.tx.xTokens.transferMulticurrencies(
    [
      [currencyId, rawAmount],
      [currencyFeeId, MOONBEAM_XCM_FEE_GLMR], // TODO must be fetched.
    ],
    1,
    destination,
    "Unlimited"
  );
}
