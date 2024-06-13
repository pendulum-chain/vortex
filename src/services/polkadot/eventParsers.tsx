import { stellarHexToPublic, hexToString } from './convert';
import Big from 'big.js';

export type SpacewalkRedeemRequestEvent = ReturnType<typeof parseEventRedeemRequest>;

export type TokenTransferEvent = ReturnType<typeof parseTokenTransferEvent>;

export function parseEventRedeemRequest(event: any) {
  const rawEventData = JSON.parse(event.event.data.toString());
  const mappedData = {
    redeemId: rawEventData[0].toString(),
    redeemer: rawEventData[1].toString(),
    vaultId: {
      accountId: rawEventData[2].accountId.toString(),
      currencies: {
        collateral: {
          XCM: parseInt(rawEventData[2].currencies.collateral.xcm.toString(), 10),
        },
        wrapped: extractStellarAssetInfo(rawEventData[2].currencies.wrapped),
      },
    },
    amount: parseInt(rawEventData[3].toString(), 10),
    asset: extractStellarAssetInfo(rawEventData[4]),
    fee: parseInt(rawEventData[5].toString(), 10),
    premium: parseInt(rawEventData[6].toString(), 10),
    stellarAddress: stellarHexToPublic(rawEventData[7].toString()),
    transferFee: parseInt(rawEventData[8].toString(), 10),
  };
  return mappedData;
}

export function parseEventRedeemExecution(event: any) {
  const rawEventData = JSON.parse(event.event.data.toString());
  const mappedData = {
    redeemId: rawEventData[0].toString(),
    redeemer: rawEventData[1].toString(),
    vaultId: {
      accountId: rawEventData[2].accountId.toString(),
      currencies: {
        collateral: {
          XCM: parseInt(rawEventData[2].currencies.collateral.xcm.toString(), 10),
        },
        wrapped: extractStellarAssetInfo(rawEventData[2].currencies.wrapped),
      },
    },
    amount: parseInt(rawEventData[3].toString(), 10),
    asset: extractStellarAssetInfo(rawEventData[4]),
    fee: parseInt(rawEventData[5].toString(), 10),
    transferFee: parseInt(rawEventData[6].toString(), 10),
  };
  return mappedData;
}

function extractStellarAssetInfo(data: any) {
  if ('stellarNative' in data.stellar) {
    return {
      Stellar: 'StellarNative',
    };
  } else if ('alphaNum4' in data.stellar) {
    return {
      Stellar: {
        AlphaNum4: {
          code: hexToString(data.stellar.alphaNum4.code.toString()),
          issuer: stellarHexToPublic(data.stellar.alphaNum4.issuer.toString()),
        },
      },
    };
  } else if ('alphaNum12' in data.stellar) {
    return {
      Stellar: {
        AlphaNum12: {
          code: hexToString(data.stellar.alphaNum12.code.toString()),
          issuer: stellarHexToPublic(data.stellar.alphaNum12.issuer.toString()),
        },
      },
    };
  } else {
    throw new Error('Invalid Stellar type');
  }
}

export function parseTokenTransferEvent(event: any) {
  const rawEventData = JSON.parse(event.event.data.toString());
  const mappedData = {
    currencyId: rawEventData[0],
    from: rawEventData[1].toString() as string, 
    to: rawEventData[2].toString() as string, 
    amount: new Big(rawEventData[3].toString()) as Big,
  };
  return mappedData;
}

// Both functions used to compare betweem CurrencyId's
// where {XCM: x} == {xcm: x}
function normalizeObjectKeys(obj: any) {
  return Object.keys(obj).reduce((acc: any, key) => {
      acc[key.toLowerCase()] = obj[key];
      return acc;
  }, {});
}

export function compareObjects(obj1: any, obj2: any) {
  const normalizedObj1 = normalizeObjectKeys(obj1);
  const normalizedObj2 = normalizeObjectKeys(obj2);

  const keys1 = Object.keys(normalizedObj1);
  const keys2 = Object.keys(normalizedObj2);

  if (keys1.length !== keys2.length) {
      return false;
  }

  for (let key of keys1) {
      if (normalizedObj1[key] !== normalizedObj2[key]) {
          return false;
      }
  }

  return true;
}
