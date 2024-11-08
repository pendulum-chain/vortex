const { quoteProviders } = require('../../config/vars');

// See https://docs.transak.com/reference/get-price
async function priceQuery(cryptoCurrency, fiatCurrency, cryptoAmount, network, isBuyOrSell, paymentMethod) {
  const { baseUrl, partnerApiKey } = quoteProviders.transak;
  const requestPath = '/api/v1/pricing/public/quotes';
  const requestUrl = baseUrl + requestPath;
  const params = new URLSearchParams({
    partnerApiKey,
    cryptoCurrency,
    fiatCurrency,
    cryptoAmount,
    network,
    isBuyOrSell,
  });
  if (paymentMethod) {
    params.append('paymentMethod', paymentMethod);
  }
  const paramsString = params.toString();
  const url = `${requestUrl}?${paramsString}`;

  return fetch(url).then(async (response) => {
    if (!response.ok) {
      const body = await response.json();
      if (body.error.message === 'Invalid fiat currency') {
        throw new Error('Token not supported');
      }
      throw new Error(
        `Could not get quote for ${cryptoCurrency} to ${fiatCurrency} from Transak: ${body.error.message}`,
      );
    }
    const body = await response.json();
    const { conversionPrice, cryptoAmount, fiatAmount, totalFee } = body.response;

    return {
      cryptoPrice: conversionPrice,
      cryptoAmount,
      // The fiatAmount we receive from Transak already includes the fees
      fiatAmount,
      totalFee,
    };
  });
}

exports.getQuoteFor = (fromCrypto, toFiat, amount) => {
  const network = 'polygon';
  const side = 'SELL'; // We always sell our crypto for fiat

  // We assume the default payment method is used
  const paymentMethod = undefined;

  // The currencies need to be in uppercase
  return priceQuery(fromCrypto.toUpperCase(), toFiat.toUpperCase(), amount, network, side, paymentMethod);
};
