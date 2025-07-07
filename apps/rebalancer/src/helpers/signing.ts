import type { Extrinsic } from "@pendulum-chain/api-solang";
import type { ApiPromise } from "@polkadot/api";
import type { KeyringPair } from "@polkadot/keyring/types";
import type { DispatchError, EventRecord } from "@polkadot/types/interfaces";
import type { ISubmittableResult, Signer } from "@polkadot/types/types";

export async function signAndSubmitSubstrateTransaction(
  extrinsic: Extrinsic,
  signer: KeyringPair,
  api: ApiPromise
): Promise<string> {
  return new Promise((resolve, reject) => {
    let inBlockHash: string | null = null;

    extrinsic
      .signAndSend(signer, (submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        if (status.isInBlock && !inBlockHash) {
          inBlockHash = status.asInBlock.toString();
        }

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find a 'system.ExtrinsicFailed' event
          const systemExtrinsicFailedEvent = events.find(
            record => record.event.section === "system" && record.event.method === "ExtrinsicFailed"
          );
          if (dispatchError) {
            reject(handleDispatchError(api, dispatchError, systemExtrinsicFailedEvent, "Redeem Request"));
          }

          resolve(hash);
        }
      })
      .catch(error => {
        // Most likely, the user cancelled the signing process.
        console.error("Error signing and submitting transaction", error);
        reject("Error signing and sending transaction:" + error);
      });
  });
}
// We first check if dispatchError is of type "module",
// If not we either return ExtrinsicFailedError or Unknown dispatch error
function handleDispatchError(
  api: ApiPromise,
  dispatchError: DispatchError,
  systemExtrinsicFailedEvent: EventRecord | undefined,
  extrinsicCalled: unknown
) {
  if (dispatchError?.isModule) {
    const decoded = api.registry.findMetaError(dispatchError.asModule);
    const { name, section, method } = decoded;

    return new Error(`Dispatch error: ${section}.${method}:: ${name}`);
  }
  if (systemExtrinsicFailedEvent) {
    const eventName =
      systemExtrinsicFailedEvent?.event.data && systemExtrinsicFailedEvent?.event.data.length > 0
        ? // @ts-ignore
          systemExtrinsicFailedEvent?.event.data[0].toString()
        : "Unknown";

    const {
      phase,
      event: { method, section }
    } = systemExtrinsicFailedEvent;
    console.error(`Extrinsic failed in phase ${phase.toString()} with ${section}.${method}:: ${eventName}`);

    return new Error(`Failed to dispatch ${extrinsicCalled}`);
  }

  console.error("Encountered some other error: ", dispatchError?.toString(), JSON.stringify(dispatchError));
  return new Error(`Unknown error during ${extrinsicCalled}`);
}
