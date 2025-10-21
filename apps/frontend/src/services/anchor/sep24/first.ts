import { FiatToken, getTokenDetailsSpacewalk } from "@packages/shared";
import { config } from "../../../config";
import { IAnchorSessionParams, ISep24Intermediate } from "../../../types/sep";

export async function sep24First(
  sessionParams: IAnchorSessionParams,
  ANCLAP_sep10Account: string,
  outputToken: FiatToken
): Promise<ISep24Intermediate> {
  if (config.test.mockSep24) {
    return { id: "1234", url: "https://www.example.com" };
  }

  const { token, tomlValues, offrampAmount } = sessionParams;
  const { sep24Url } = tomlValues;
  const { usesMemo } = getTokenDetailsSpacewalk(outputToken);
  const assetCode = sessionParams.tokenConfig.stellarAsset.code.string;

  const params = {
    amount: offrampAmount,
    asset_code: assetCode,
    ...(usesMemo && { account: ANCLAP_sep10Account })
  };

  console.log("Initiating SEP-24 with params:", params);
  const response = await fetch(`${sep24Url}/transactions/withdraw/interactive`, {
    body: JSON.stringify(params),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  console.log("SEP-24 first response status:", response.status);
  if (response.status !== 200) {
    console.log(await response.json(), params.toString());
    throw new Error(`Failed to initiate SEP-24: ${response.statusText}`);
  }

  const { type, url, id } = await response.json();
  if (type !== "interactive_customer_info_needed") {
    throw new Error(`Unexpected SEP-24 type: ${type}`);
  }

  return { id, url };
}
