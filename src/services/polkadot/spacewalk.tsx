import { Keyring } from '@polkadot/api';
import { Asset } from 'stellar-sdk';
import { stellarHexToPublic } from './convert';
import { parseEventRedeemRequest } from './eventParsers';
import { Api } from './polkadotApi';
import { SpacewalkPrimitivesVaultId } from '@polkadot/types/lookup';
import { Buffer } from 'buffer';
import { ISubmittableResult } from '@polkadot/types/types';

export function extractAssetFromWrapped(wrapped: any) {
  if (wrapped.Stellar === 'StellarNative') {
    return Asset.native();
  } else if ('AlphaNum4' in wrapped.Stellar) {
    // Check if we need to convert the issuer to a public key
    const issuer = wrapped.Stellar.AlphaNum4.issuer.startsWith('0x')
      ? stellarHexToPublic(wrapped.Stellar.AlphaNum4.issuer)
      : wrapped.Stellar.AlphaNum4.issuer;

    return new Asset(trimCode(wrapped.Stellar.AlphaNum4.code), issuer);
  } else if ('AlphaNum12' in wrapped.Stellar) {
    // Check if we need to convert the issuer to a public key
    const issuer = wrapped.Stellar.AlphaNum12.issuer.startsWith('0x')
      ? stellarHexToPublic(wrapped.Stellar.AlphaNum12.issuer)
      : wrapped.Stellar.AlphaNum12.issuer;

    return new Asset(trimCode(wrapped.Stellar.AlphaNum12.code), issuer);
  } else {
    throw new Error('Invalid Stellar type in wrapped');
  }
}

// Take an asset code that is either hex or ascii and trim it from 0 bytes
function trimCode(code: any) {
  if (code.startsWith('0x')) {
    // Filter out the null bytes
    const filtered = code.replace(/00/g, '');
    return Buffer.from(filtered.slice(2), 'hex').toString().trim();
  } else {
    // Convert to hex string
    const hex = Buffer.from(code).toString('hex');
    // Filter out the null bytes
    const filtered = hex.replace(/00/g, '');
    // Convert back to ascii
    return Buffer.from(filtered, 'hex').toString().trim();
  }
}

export function prettyPrintVaultId(vaultId: any) {
  const wrappedAssetInfo = extractAssetFromWrapped(vaultId.currencies.wrapped);

  return `${vaultId.accountId} { XCM(${vaultId.currencies.collateral.XCM}) - ${prettyPrintAssetInfo(
    wrappedAssetInfo,
  )} }`;
}

// We just omit the issuer here for readability
function prettyPrintAssetInfo(assetInfo: any) {
  // Decode hex code to ascii if it starts with 0x
  if (assetInfo.code.startsWith('0x')) {
    return trimCode(assetInfo.code);
  }

  return assetInfo.code;
}

export class VaultService {
  vaultId: SpacewalkPrimitivesVaultId | undefined = undefined;
  api: Api | undefined = undefined;

  constructor(vaultId: any, api: Api) {
    this.vaultId = vaultId;
    // Potentially validate the vault given the network,
    // validate the wrapped asset consistency, etc
    this.api = api;
  }

  async requestRedeem(uri: string, amount: string, stellarPkBytes: Buffer) {
    const keyring = new Keyring({ type: 'sr25519' });
    keyring.setSS58Format(this.api!.ss58Format);
    const origin = keyring.addFromUri(uri);

    const release = await this.api!.mutex.lock(origin.address);
    const nonce = await this.api!.api.rpc.system.accountNextIndex(origin.publicKey);

    // The result will be assigned in the callback
    let result = undefined;

    await this.api!.api.tx.redeem.requestRedeem(amount, stellarPkBytes, this.vaultId!)
      .signAndSend(origin, { nonce }, (submissionResult: ISubmittableResult) => {
        const { status, events, dispatchError } = submissionResult;

        if (status.isFinalized) {
          console.log(
            `Requested redeem of ${amount} for vault ${prettyPrintVaultId(this.vaultId)} with status ${status.type}`,
          );

          // Try to find a 'system.ExtrinsicFailed' event
          const systemExtrinsicFailedEvent = events.find((record) => {
            return record.event.section === 'system' && record.event.method === 'ExtrinsicFailed';
          });

          if (dispatchError) {
            throw this.handleDispatchError(dispatchError, systemExtrinsicFailedEvent, 'Redeem Request');
          }
          //find all redeem request events and filter the one that matches the requester
          const redeemEvents = events.filter((event) => {
            return (
              event.event.section.toLowerCase() === 'redeem' && event.event.method.toLowerCase() === 'requestredeem'
            );
          });

          const event = redeemEvents
            .map((event) => parseEventRedeemRequest(event))
            .filter((event) => {
              return event.redeemer === origin.address;
            });

          if (event.length == 0) {
            throw new Error(`No redeem event found for account ${origin.address}`);
          }
          //we should only find one event corresponding to the issue request
          if (event.length != 1) {
            throw new Error('Inconsistent amount of redeem request events for account');
          }
          result = event[0];
        }
      })
      .catch((error) => {
        throw new Error(`Failed to request redeem: ${error}`);
      })
      .finally(() => release());

    return result;
  }

  // We first check if dispatchError is of type "module",
  // If not we either return ExtrinsicFailedError or Unknown dispatch error
  handleDispatchError(dispatchError: any, systemExtrinsicFailedEvent: any, extrinsicCalled: any) {
    if (dispatchError?.isModule) {
      const decoded = this.api!.api.registry.findMetaError(dispatchError.asModule);
      const { docs, name, section, method } = decoded;

      return new Error(`Dispatch error: ${section}.${method}:: ${name}`);
    } else if (systemExtrinsicFailedEvent) {
      const eventName =
        systemExtrinsicFailedEvent?.event.data && systemExtrinsicFailedEvent?.event.data.length > 0
          ? systemExtrinsicFailedEvent?.event.data[0].toString()
          : 'Unknown';

      const {
        phase,
        event: { data, method, section },
      } = systemExtrinsicFailedEvent;
      console.log(`Extrinsic failed in phase ${phase.toString()} with ${section}.${method}:: ${eventName}`);

      return new Error(`Failed to dispatch ${extrinsicCalled}`);
    } else {
      console.log('Encountered some other error: ', dispatchError?.toString(), JSON.stringify(dispatchError));
      return new Error(`Unknown error during ${extrinsicCalled}`);
    }
  }
}
