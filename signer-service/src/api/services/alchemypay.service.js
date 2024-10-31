const crypto = require('crypto');
const { quoteProviders } = require('../../config/vars');

function apiSign(timestamp, method, requestUrl, body, secretKey) {
  const content = timestamp + method.toUpperCase() + getPath(requestUrl) + getJsonBody(body);
  return crypto.createHmac('sha256', secretKey).update(content).digest('base64');
}

function getPath(requestUrl) {
  const uri = new URL(requestUrl);
  const path = uri.pathname;
  const params = Array.from(uri.searchParams.entries());

  if (params.length === 0) {
    return path;
  } else {
    const sortedParams = [...params].sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
    const queryString = sortedParams.map(([key, value]) => `${key}=${value}`).join('&');
    return `${path}?${queryString}`;
  }
}

function getJsonBody(body) {
  let map;

  try {
    map = JSON.parse(body);
  } catch (error) {
    map = {};
    console.error("Couldn't parse JSON body", error);
  }

  if (Object.keys(map).length === 0) {
    return '';
  }

  map = removeEmptyKeys(map);
  map = sortObject(map);

  return JSON.stringify(map);
}

function removeEmptyKeys(map) {
  const retMap = {};

  for (const [key, value] of Object.entries(map)) {
    if (value !== null && value !== '') {
      retMap[key] = value;
    }
  }

  return retMap;
}

function sortObject(obj) {
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return sortList(obj);
    } else {
      return sortMap(obj);
    }
  }

  return obj;
}

function sortMap(map) {
  const sortedMap = new Map(Object.entries(removeEmptyKeys(map)).sort(([aKey], [bKey]) => aKey.localeCompare(bKey)));

  for (const [key, value] of sortedMap.entries()) {
    if (typeof value === 'object') {
      sortedMap.set(key, sortObject(value));
    }
  }

  return Object.fromEntries(sortedMap.entries());
}

function sortList(list) {
  const objectList = [];
  const intList = [];
  const floatList = [];
  const stringList = [];
  const jsonArray = [];

  for (const item of list) {
    if (typeof item === 'object') {
      jsonArray.push(item);
    } else if (Number.isInteger(item)) {
      intList.push(item);
    } else if (typeof item === 'number') {
      floatList.push(item);
    } else if (typeof item === 'string') {
      stringList.push(item);
    } else {
      intList.push(item);
    }
  }

  intList.sort((a, b) => a - b);
  floatList.sort((a, b) => a - b);
  stringList.sort();

  objectList.push(...intList, ...floatList, ...stringList, ...jsonArray);
  list.length = 0;
  list.push(...objectList);

  const retList = [];

  for (const item of list) {
    if (typeof item === 'object') {
      retList.push(sortObject(item));
    } else {
      retList.push(item);
    }
  }

  return retList;
}

// See https://alchemypay.readme.io/docs/price-query
function priceQuery(crypto, fiat, amount, network, side) {
  const { secretKey, baseUrl, appId } = quoteProviders.alchemyPay;
  const httpMethod = 'POST';
  const requestPath = '/open/api/v4/merchant/order/quote';
  const requestUrl = baseUrl + requestPath;
  const timestamp = String(Date.now());

  const bodyString = JSON.stringify({
    crypto,
    network,
    fiat,
    amount,
    side,
  });
  // It's important to sort the body before signing. It's also important for the POST request to have the body sorted.
  const sortedBody = getJsonBody(bodyString);

  const signature = apiSign(timestamp, httpMethod, requestUrl, sortedBody, secretKey.trim());

  const headers = {
    'Content-Type': 'application/json',
    appId,
    timestamp,
    sign: signature,
  };

  const request = {
    method: 'POST',
    headers,
    body: sortedBody,
  };

  const url = baseUrl + requestPath;

  return fetch(url, request)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const body = await response.json();
      if (!body.success) {
        throw new Error('Could not get quote: ' + body.returnMsg || 'Unknown error');
      }

      const { cryptoPrice, rampFee, networkFee, fiatQuantity } = body.data;

      const totalFee = (rampFee || 0) + (networkFee || 0);
      // According to a comment in the response sample [here](https://alchemypay.readme.io/docs/price-query#response-sample)
      // the `fiatQuantity` does not yet include the fees so we need to subtract them.
      const fiatAmount = fiatQuantity - totalFee;

      return {
        cryptoPrice,
        cryptoAmount: amount,
        fiatAmount,
        totalFee,
      };
    })
    .then((data) => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data;
    })
    .catch((error) => {
      console.error('Error fetching quote:', error);
      throw error;
    });
}

exports.getQuoteFor = (fromCrypto, toFiat, amount) => {
  const network = 'MATIC'; // see https://alchemypay.readme.io/docs/network-code
  const side = 'SELL';

  // The currencies need to be in uppercase
  return priceQuery(fromCrypto.toUpperCase(), toFiat.toUpperCase(), amount, network, side);
};
