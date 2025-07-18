import { Event } from "@polkadot/types/interfaces";
import { encodeAddress } from "@polkadot/util-crypto";
import Big from "big.js";

import { hexToString, stellarHexToPublic } from "../helpers/conversions";

export type SpacewalkRedeemRequestEvent = ReturnType<typeof parseEventRedeemRequest>;
export type XcmSentEvent = ReturnType<typeof parseEventXcmSent>;
export type XTokensEvent = ReturnType<typeof parseEventXTokens>;

export type TokenTransferEvent = ReturnType<typeof parseTokenDepositEvent>;

export function parseEventRedeemRequest({ event }: { event: Event }) {
  const rawEventData = JSON.parse(event.data.toString());
  const mappedData = {
    amount: parseInt(rawEventData[3].toString(), 10),
    asset: extractStellarAssetInfo(rawEventData[4]),
    fee: parseInt(rawEventData[5].toString(), 10),
    premium: parseInt(rawEventData[6].toString(), 10),
    redeemer: rawEventData[1].toString(),
    redeemId: rawEventData[0].toString(),
    stellarAddress: stellarHexToPublic(rawEventData[7].toString()),
    transferFee: parseInt(rawEventData[8].toString(), 10),
    vaultId: {
      accountId: rawEventData[2].accountId.toString(),
      currencies: {
        collateral: {
          XCM: parseInt(rawEventData[2].currencies.collateral.xcm.toString(), 10)
        },
        wrapped: extractStellarAssetInfo(rawEventData[2].currencies.wrapped)
      }
    }
  };
  return mappedData;
}

export function parseEventRedeemExecution({ event }: { event: Event }) {
  const rawEventData = JSON.parse(event.data.toString());
  const mappedData = {
    amount: parseInt(rawEventData[3].toString(), 10),
    asset: extractStellarAssetInfo(rawEventData[4]),
    fee: parseInt(rawEventData[5].toString(), 10),
    redeemer: rawEventData[1].toString(),
    redeemId: rawEventData[0].toString(),
    transferFee: parseInt(rawEventData[6].toString(), 10),
    vaultId: {
      accountId: rawEventData[2].accountId.toString(),
      currencies: {
        collateral: {
          XCM: parseInt(rawEventData[2].currencies.collateral.xcm.toString(), 10)
        },
        wrapped: extractStellarAssetInfo(rawEventData[2].currencies.wrapped)
      }
    }
  };
  return mappedData;
}

export function parseEventXcmSent({ event }: { event: Event }) {
  const rawEventData = JSON.parse(event.data.toString());
  const mappedData = {
    originAddress: encodeAddress(rawEventData[0].interior.x1[0].accountId32.id.toString())
  };
  return mappedData;
}

export function parseEventMoonbeamXcmSent({ event }: { event: Event }) {
  const rawEventData = JSON.parse(event.data.toString());

  const mappedData = {
    originAddress: rawEventData[0].interior.x1[0].accountKey20.key
  };
  return mappedData;
}

export function parseEventXTokens({ event }: { event: Event }) {
  const rawEventData = JSON.parse(event.data.toString());
  const mappedData = {
    sender: rawEventData[0].toString()
  };
  return mappedData;
}

type StellarAssetData = {
  stellar:
    | {
        stellarNative: string;
      }
    | {
        alphaNum4: {
          code: string;
          issuer: string;
        };
      }
    | {
        alphaNum12: {
          code: string;
          issuer: string;
        };
      };
};

function extractStellarAssetInfo(data: StellarAssetData) {
  if ("stellarNative" in data.stellar) {
    return {
      Stellar: "StellarNative"
    };
  } else if ("alphaNum4" in data.stellar) {
    return {
      Stellar: {
        AlphaNum4: {
          code: hexToString(data.stellar.alphaNum4.code.toString()),
          issuer: stellarHexToPublic(data.stellar.alphaNum4.issuer.toString())
        }
      }
    };
  } else if ("alphaNum12" in data.stellar) {
    return {
      Stellar: {
        AlphaNum12: {
          code: hexToString(data.stellar.alphaNum12.code.toString()),
          issuer: stellarHexToPublic(data.stellar.alphaNum12.issuer.toString())
        }
      }
    };
  } else {
    throw new Error("Invalid Stellar type");
  }
}

export function parseTokenDepositEvent({ event }: { event: Event }) {
  const rawEventData = JSON.parse(event.data.toString());
  const mappedData = {
    amountRaw: new Big(rawEventData[2].toString()) as Big,
    currencyId: rawEventData[0],
    to: rawEventData[1].toString() as string
  };
  return mappedData;
}

// Both functions used to compare betweem CurrencyId's
// where {XCM: x} == {xcm: x}
function normalizeObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj).reduce((acc: Record<string, unknown>, key) => {
    acc[key.toLowerCase()] = obj[key];
    return acc;
  }, {});
}

export function compareObjects(obj1: Record<string, unknown>, obj2: Record<string, unknown>): boolean {
  const normalizedObj1 = normalizeObjectKeys(obj1);
  const normalizedObj2 = normalizeObjectKeys(obj2);

  const keys1 = Object.keys(normalizedObj1);
  const keys2 = Object.keys(normalizedObj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (normalizedObj1[key] !== normalizedObj2[key]) {
      return false;
    }
  }

  return true;
}
