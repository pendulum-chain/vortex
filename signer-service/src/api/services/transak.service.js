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

// Helper function to get the network code for Transak. It seems like Transak just uses the commonly known network names
// as the code for the network parameter in their API so we just return the network as is.
function getTransakNetworkCode(network) {
  return network.toLowerCase();
}

function getCryptoCode(fromCrypto) {
  // The currencies need to be in uppercase
  if (
    fromCrypto.toLowerCase() === 'usdc' ||
    fromCrypto.toLowerCase() === 'usdc.e' ||
    fromCrypto.toLowerCase() === 'usdce'
  ) {
    return 'USDC';
  } else if (fromCrypto.toLowerCase() === 'usdt') {
    return 'USDT';
  }

  return fromCrypto.toUpperCase();
}

function getFiatCode(toFiat) {
  // The currencies need to be in uppercase
  return toFiat.toUpperCase();
}

exports.getQuoteFor = (fromCrypto, toFiat, amount, network) => {
  const networkCode = getTransakNetworkCode(network);
  const side = 'SELL'; // We always sell our crypto for fiat

  // We assume the default payment method is used
  const paymentMethod = undefined;

  return priceQuery(getCryptoCode(fromCrypto), getFiatCode(toFiat), amount, networkCode, side, paymentMethod);
};
