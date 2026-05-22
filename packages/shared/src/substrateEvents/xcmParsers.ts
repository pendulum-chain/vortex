import { Event } from "@polkadot/types/interfaces";
import { encodeAddress } from "@polkadot/util-crypto";

export type XcmSentEvent = ReturnType<typeof parseEventXcmSent>;
export type XTokensEvent = ReturnType<typeof parseEventXTokens>;

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
