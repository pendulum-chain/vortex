import { parseEventMoonbeamXcmSent, parseEventXcmSent, parseEventXTokens, XcmSentEvent, XTokensEvent } from "@packages/shared";
import { ApiPromise } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { KeyringPair } from "@polkadot/keyring/types";
import { EventRecord, SignedBlock } from "@polkadot/types/interfaces";
import { ISubmittableResult, Signer } from "@polkadot/types/types";
import { encodeAddress } from "@polkadot/util-crypto";
import logger from "src/logger";

export class TransactionInclusionError extends Error {
  public readonly blockHash: string;

  constructor(blockHash: string, _extrinsicHash: string, message?: string) {
    super(message);
    this.blockHash = blockHash;
    Object.setPrototypeOf(this, TransactionInclusionError.prototype);
  }
}

/// Error thrown when a transaction is temporarily banned by the RPC node (Error code 1012)
export class TransactionTemporarilyBannedError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, TransactionTemporarilyBannedError.prototype);
  }
}

/// Compare two substrate addresses with arbitrary ss58 format
function substrateAddressEqual(a: string, b: string): boolean {
  // Convert both addresses to same ss58 format before comparing
  return encodeAddress(a, 0) === encodeAddress(b, 0);
}

export const signAndSubmitXcm = async (
  keyringPair: KeyringPair,
  extrinsic: SubmittableExtrinsic<"promise">
): Promise<{ hash: string }> => {
  return new Promise((resolve, reject) => {
    let inBlockHash: string | null = null;

    extrinsic
      .signAndSend(keyringPair, (submissionResult: ISubmittableResult) => {
        const { status, dispatchError } = submissionResult;

        if (status.isInBlock && !inBlockHash) {
          inBlockHash = status.asInBlock.toString();
        }

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find a 'system.ExtrinsicFailed' event
          if (dispatchError) {
            reject("Xcm transaction failed");
          }

          resolve({ hash });
        }
      })
      .catch(error => {
        // 1012 means that the extrinsic is temporarily banned and indicates that the extrinsic was already sent
        if (error?.message.includes("1012:")) {
          reject(new TransactionTemporarilyBannedError("Transaction for xcm transfer is temporarily banned."));
        }

        if (inBlockHash) {
          return reject(
            new TransactionInclusionError(
              inBlockHash,
              `Transaction may have been included in block ${inBlockHash} despite error: ${error}`
            )
          );
        }

        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });
};

async function waitForBlock(api: ApiPromise, blockHash: string, timeoutMs = 60000): Promise<SignedBlock> {
  const pollIntervalMs = 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const block = await api.rpc.chain.getBlock(blockHash);

      if (block) {
        return block;
      }
    } catch (error) {
      logger.current.error(error);
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Block ${blockHash} not found after ${timeoutMs}ms`);
}

export async function verifyXcmSentEvent(
  api: ApiPromise,
  blockHash: string,
  address: string
): Promise<{ event: XcmSentEvent; hash: string }> {
  try {
    await waitForBlock(api, blockHash);
  } catch {
    throw new Error(`Block ${blockHash} not found`);
  }

  const apiAt = await api.at(blockHash);
  const events = await apiAt.query.system.events();

  const xcmSentEvent = (events as unknown as EventRecord[])
    .filter(record => record.event.section === "polkadotXcm" && record.event.method === "Sent")
    .map(parseEventXcmSent)
    .find(event => substrateAddressEqual(event.originAddress, address));

  if (!xcmSentEvent) {
    throw new Error(`No XcmSent event found for account ${address}`);
  }

  return { event: xcmSentEvent, hash: blockHash };
}

export const submitXcm = async (
  address: string,
  extrinsic: SubmittableExtrinsic<"promise">
): Promise<{ event: XcmSentEvent; hash: string | undefined }> =>
  new Promise((resolve, reject) => {
    extrinsic
      .send((submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find a 'system.ExtrinsicFailed' event
          if (dispatchError) {
            reject("Xcm transaction failed");
          }

          // Try to find 'polkadotXcm.Sent' events
          const xcmSentEvents = events.filter(
            record => record.event.section === "polkadotXcm" && record.event.method === "Sent"
          );

          const event = xcmSentEvents
            .map(event => parseEventXcmSent(event))
            .filter(event => {
              return substrateAddressEqual(event.originAddress, address);
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
          reject(new TransactionTemporarilyBannedError("Transaction for xcm transfer is temporarily banned."));
        }
        reject(new Error(`Failed to do XCM transfer: ${error}`));
      });
  });

export const submitMoonbeamXcm = async (
  address: string,
  extrinsic: SubmittableExtrinsic<"promise">
): Promise<{ event: XcmSentEvent; hash: string }> =>
  new Promise((resolve, reject) => {
    logger.current.info(`Submitting XCM transfer for address ${address}`);
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
          reject(new Error(`XCM transfer failed with status: ${status.type}`));
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

          if (!event) {
            reject(new Error(`No XcmSent event found for account ${address}`));
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

        if (status.isFinalized) {
          const hash = status.asFinalized.toString();

          // Try to find a 'system.ExtrinsicFailed' event
          if (dispatchError) {
            reject("Xcm transaction failed");
          }

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
