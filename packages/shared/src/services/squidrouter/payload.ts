import { eth } from "web3";

export function encodePayload(address: string): `0x${string}` {
  // Encode the payload
  // Asset should match the one received on Moonbeam side. Right now this is not used
  // on the contract so it can be anything.
  const destination = [1, ["0x000000082E", `0x01${address.slice(2)}00`]];

  // Encode the data
  const payload = eth.abi.encodeParameters(
    [
      {
        components: [
          { name: "parents", type: "uint8" },
          { name: "interior", type: "bytes[]" }
        ],
        name: "destination",
        type: "tuple"
      },
      { name: "weight", type: "uint256" }
    ],
    [destination, 1000000000000000]
  );

  return payload as `0x${string}`;
}
