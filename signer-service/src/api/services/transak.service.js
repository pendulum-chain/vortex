const { quoteProviders } = require('../../config/vars');

async function priceQuery(cryptoCurrency, fiatCurrency, fiatAmount, network, isBuyOrSell, paymentMethod) {
  const { baseUrl, partnerApiKey } = quoteProviders.transak;
  const requestPath = '/api/v1/pricing/public/quotes';
  const requestUrl = baseUrl + requestPath;
  const params = new URLSearchParams({
    partnerApiKey,
    cryptoCurrency,
    fiatCurrency,
    fiatAmount,
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
      console.error('Could not get quote from Transak', await response.text());
      throw new Error(`HTTP error! status: ${response.status}`);
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
  // const side = 'SELL'; // We always sell our crypto for fiat

  // FIXME switch to SELL once KYB is done
  const side = 'BUY';

  // If the fiat currency is EUR we can use SEPA bank transfer, otherwise we assume credit_debit_card
  // const paymentMethod = toFiat.toLowerCase() === 'eur' ? 'sepa_bank_transfer' : 'credit_debit_card';
  // FIXME switch to SEPA bank transfer once KYB is done
  const paymentMethod = undefined;

  return priceQuery(fromCrypto, toFiat, amount, network, side, paymentMethod);
};
