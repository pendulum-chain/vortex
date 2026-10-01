import { Event } from "@polkadot/types/interfaces";

export type XcmSentEvent = ReturnType<typeof parseEventMoonbeamXcmSent>;
export type XTokensEvent = ReturnType<typeof parseEventXTokens>;

type MoonbeamXcmSentJson = {
  interior: { x1: [{ accountKey20: { key: string } }] };
};

export function parseEventMoonbeamXcmSent({ event }: { event: Event }) {
  const rawEventData = event.data.toJSON() as unknown as [MoonbeamXcmSentJson];

  const mappedData = {
    originAddress: rawEventData[0].interior.x1[0].accountKey20.key
  };
  return mappedData;
}

export function parseEventXTokens({ event }: { event: Event }) {
  const rawEventData = event.data.toJSON() as unknown as [{ toString: () => string }];
  const mappedData = {
    sender: rawEventData[0].toString()
  };
  return mappedData;
}
