import { IAnchorSessionParams, ISep24Intermediate } from '../../../types/sep';
import { getTokenDetailsSpacewalk } from '../../../constants/tokenConfig';
import { FiatToken } from '../../../constants/tokenConfig';
import { config } from '../../../config';

export async function sep24First(
  sessionParams: IAnchorSessionParams,
  ANCLAP_sep10Account: string,
  outputToken: FiatToken,
): Promise<ISep24Intermediate> {
  if (config.test.mockSep24) {
    return { url: 'https://www.example.com', id: '1234' };
  }

  const { token, tomlValues, offrampAmount } = sessionParams;
  const { sep24Url } = tomlValues;
  const { usesMemo } = getTokenDetailsSpacewalk(outputToken);
  const assetCode = sessionParams.tokenConfig.stellarAsset.code.string;

  const params = new URLSearchParams({
    asset_code: assetCode,
    amount: offrampAmount,
    ...(usesMemo && { account: ANCLAP_sep10Account }),
  });

  const response = await fetch(`${sep24Url}/transactions/withdraw/interactive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
    },
    body: params.toString(),
  });

  if (response.status !== 200) {
    console.log(await response.json(), params.toString());
    throw new Error(`Failed to initiate SEP-24: ${response.statusText}`);
  }

  const { type, url, id } = await response.json();
  if (type !== 'interactive_customer_info_needed') {
    throw new Error(`Unexpected SEP-24 type: ${type}`);
  }

  return { url, id };
}
