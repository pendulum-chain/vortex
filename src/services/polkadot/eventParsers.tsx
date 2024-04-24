import { stellarHexToPublic, hexToString } from './convert.js';

export type SpacewalkRedeemRequestEvent = ReturnType<typeof parseEventRedeemRequest>;

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
