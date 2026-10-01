import { SubmittableExtrinsic } from "@polkadot/api/submittable/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { encodeAddress, evmToAddress } from "@polkadot/util-crypto";
import { logger, parseEventMoonbeamXcmSent, parseEventXTokens, XcmSentEvent, XTokensEvent } from "../../index";

/// Error thrown when a transaction is temporarily banned by the RPC node (Error code 1012)
export class TransactionTemporarilyBannedError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, TransactionTemporarilyBannedError.prototype);
  }
}

/// Compare two substrate addresses with arbitrary ss58 format
export function substrateAddressEqual(a: string, b: string): boolean {
  if (a === b) return true;
  // Convert both addresses to same ss58 format before comparing
  if (a.length === 40 && b.length === 40) return evmToAddress(a, 0) === evmToAddress(b, 0);
  else return encodeAddress(a, 0) === encodeAddress(b, 0);
}

export const submitMoonbeamXcm = async (
  address: string,
  extrinsic: SubmittableExtrinsic<"promise">
): Promise<{ event: XcmSentEvent; hash: string }> =>
  new Promise((resolve, reject) => {
    logger.current.info(`Submitting XCM transfer for address ${address}`);

    // A helper to track if the extrinsic reached the 'InBlock' state
    // If it reaches 'InBlock', we expect it to eventually finalize
    let willFinalize = false;

    extrinsic
      .send((submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        logger.current.info(`Moonbeam XCM transfer status: ${status.type}`);

        // Try to find a 'system.ExtrinsicFailed' event
        if (dispatchError) {
          reject("Xcm transaction failed");
        }

        if (status.isInvalid) {
          logger.current.error(`XCM transfer failed with status: ${status.type}`);

          if (!willFinalize) {
            // Only reject if we haven't seen 'InBlock' yet
            reject(new Error(`XCM transfer rejected with IsInvalid with status: ${status.type}`));
          }
        }

        if (status.isInBlock) {
          willFinalize = true;
        }

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();
          // Try to find 'polkadotXcm.Sent' events
          const xcmSentEvents = events.filter(
            record => record.event.section === "polkadotXcm" && record.event.method === "Sent"
          );
          const event = xcmSentEvents
            .map(event => parseEventMoonbeamXcmSent(event))
            .filter(event => event.originAddress === address);

          if (event.length === 0) {
            reject(new Error(`No XcmSent event found for account ${address}`));
            return;
          }
          resolve({ event: event[0], hash });
        }
      })
      .catch(error => {
        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });

export const submitXTokens = async (
  address: string,
  extrinsic: SubmittableExtrinsic<"promise">
): Promise<{ event: XTokensEvent; hash: string | undefined }> =>
  new Promise((resolve, reject) => {
    return extrinsic
      .send((submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        if (dispatchError) {
          reject("Xcm transaction failed");
        }

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find 'xTokens.TransferredMultiAssets' events
          const xTokenEvents = events.filter(
            record => record.event.section === "xTokens" && record.event.method === "TransferredMultiAssets"
          );

          const event = xTokenEvents
            .map(event => parseEventXTokens(event))
            .filter(event => {
              return substrateAddressEqual(event.sender, address);
            });

          if (event.length === 0) {
            reject(new Error(`No XcmSent event found for account ${address}`));
          }
          resolve({ event: event[0], hash });
        }
      })
      .catch(error => {
        // 1012 means that the extrinsic is temporarily banned and indicates that the extrinsic was already sent
        if (error?.message.includes("1012:")) {
          reject(new TransactionTemporarilyBannedError("Transaction for xtokens transfer is temporarily banned."));
        }
        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });
