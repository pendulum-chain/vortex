const { quoteProviders } = require('../../config/vars');

// See https://dev.moonpay.com/reference/getsellquote
async function priceQuery(currencyCode, quoteCurrencyCode, baseCurrencyAmount, extraFeePercentage, payoutMethod) {
  const { baseUrl, apiKey } = quoteProviders.moonpay;
  const requestPath = `/v3/currencies/${currencyCode}/sell_quote`;
  const requestUrl = baseUrl + requestPath;
  const params = new URLSearchParams({
    apiKey,
    quoteCurrencyCode,
    baseCurrencyAmount,
    extraFeePercentage,
  });
  if (payoutMethod) {
    params.append('payoutMethod', payoutMethod);
  }
  const paramsString = params.toString();
  const url = `${requestUrl}?${paramsString}`;

  return fetch(url).then(async (response) => {
    if (!response.ok) {
      const body = await response.json();
      if (body.type === 'NotFoundError') {
        throw new Error('Token not supported');
      }
      throw new Error(`Could not get quote for ${currencyCode} to ${quoteCurrencyCode} from Moonpay: ${body.message}`);
    }
    const body = await response.json();
    const { baseCurrencyAmount, baseCurrencyPrice, quoteCurrencyAmount, feeAmount } = body;

    return {
      cryptoPrice: baseCurrencyPrice,
      cryptoAmount: baseCurrencyAmount,
      // The fiatAmount we receive from Moonpay already includes the fees
      fiatAmount: quoteCurrencyAmount,
      totalFee: feeAmount,
    };
  });
}

exports.getQuoteFor = (fromCrypto, toFiat, amount) => {
  // If fromCrypto is USDC, we need to convert it to USDC_Polygon
  const fromCryptoPolygon = fromCrypto.toLowerCase() === 'usdc' ? 'usdc_polygon' : fromCrypto;

  // We can specify a custom fee percentage here added on top of the Moonpay fee but we don't
  const extraFeePercentage = 0;
  // If the fiat currency is EUR we can use SEPA bank transfer, otherwise we assume credit_debit_card
  const paymentMethod = toFiat.toLowerCase() === 'eur' ? 'sepa_bank_transfer' : 'credit_debit_card';

  return priceQuery(fromCryptoPolygon, toFiat, amount, extraFeePercentage, paymentMethod);
};
