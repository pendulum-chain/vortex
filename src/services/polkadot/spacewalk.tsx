import { ApiPromise, Keyring } from '@polkadot/api';
import { Asset } from 'stellar-sdk';
import { stellarHexToPublic } from './convert';
import { parseEventRedeemRequest, SpacewalkRedeemRequestEvent } from './eventParsers';
import { ApiComponents } from './polkadotApi';
import { SpacewalkPrimitivesVaultId } from '@polkadot/types/lookup';
import { Buffer } from 'buffer';
import { ISubmittableResult } from '@polkadot/types/types';
import { WalletAccount } from '@talismn/connect-wallets';
import { getAddressForFormat } from '../../helpers/addressFormatter';
import { KeyringPair } from '@polkadot/keyring/types';
import { SpacewalkPrimitivesCurrencyId } from '@pendulum-chain/types/interfaces';

export function extractAssetFromWrapped(wrapped: SpacewalkPrimitivesCurrencyId) {
  if (!wrapped.isStellar) {
    throw new Error('Invalid wrapped asset type');
  }
  const stellarAsset = wrapped.asStellar;
  const stellarType = stellarAsset.type;
  if (stellarType === 'StellarNative') {
    return Asset.native();
  } else if (stellarType === 'AlphaNum4') {
    // Check if we need to convert the issuer to a public key
    const issuer = stellarAsset.asAlphaNum4.issuer.toString().startsWith('0x')
      ? stellarHexToPublic(stellarAsset.asAlphaNum4.issuer.toString())
      : stellarAsset.asAlphaNum4.issuer.toString();

    return new Asset(trimCode(stellarAsset.asAlphaNum4.code.toString()), issuer);
  } else if (stellarType === 'AlphaNum12') {
    // Check if we need to convert the issuer to a public key
    const issuer = stellarAsset.asAlphaNum12.issuer.toString().startsWith('0x')
      ? stellarHexToPublic(stellarAsset.asAlphaNum12.issuer.toString())
      : stellarAsset.asAlphaNum12.issuer.toString();

    return new Asset(trimCode(stellarAsset.asAlphaNum12.code.toString()), issuer);
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

export function prettyPrintVaultId(vaultId: SpacewalkPrimitivesVaultId) {
  const collateralAssetInfo = vaultId.currencies.collateral.isXcm ? vaultId.currencies.collateral.asXcm : 'Unknown';
  const wrappedAssetInfo = extractAssetFromWrapped(vaultId.currencies.wrapped);

  return `${vaultId.accountId} { XCM(${collateralAssetInfo}) - ${prettyPrintAssetInfo(wrappedAssetInfo)} }`;
}

// We just omit the issuer here for readability
function prettyPrintAssetInfo(assetInfo: any) {
  // Decode hex code to ascii if it starts with 0x
  if (assetInfo.code.startsWith('0x')) {
    return trimCode(assetInfo.code);
  }

  return assetInfo.code;
}

export async function getVaultsForCurrency(api: ApiPromise, currencySymbol: string) {
  const vaultEntries = await api.query.vaultRegistry.vaults.entries();
  const vaults = vaultEntries.map(([key, value]) => value.unwrap());

  const vaultsForCurrency = vaults.filter((vault) => {
    return (
      vault.id.currencies.wrapped.isStellar &&
      vault.id.currencies.wrapped.asStellar.isAlphaNum4 &&
      vault.id.currencies.wrapped.asStellar.asAlphaNum4.code.toHuman() === currencySymbol
    );
  });

  return vaultsForCurrency;
}

function isWalletAccount(signer: WalletAccount | KeyringPair): signer is WalletAccount {
  return (signer as WalletAccount).signer !== undefined;
}

export class VaultService {
  vaultId: SpacewalkPrimitivesVaultId;
  apiComponents: ApiComponents | undefined = undefined;

  constructor(vaultId: SpacewalkPrimitivesVaultId, apiComponents: ApiComponents) {
    this.vaultId = vaultId;
    // Potentially validate the vault given the network,
    // validate the wrapped asset consistency, etc
    this.apiComponents = apiComponents;
  }

  async requestRedeem(accountOrPair: WalletAccount | KeyringPair, amount: string, stellarPkBytesBuffer: Buffer) {
    const keyring = new Keyring({ type: 'sr25519' });
    keyring.setSS58Format(this.apiComponents!.ss58Format);

    // We distinguish between a WalletAccount and a KeyringPair because we need to handle the signer differently
    const addressOrPair = isWalletAccount(accountOrPair) ? accountOrPair.address : accountOrPair;
    const address = isWalletAccount(accountOrPair)
      ? accountOrPair.address
      : keyring.encodeAddress(accountOrPair.publicKey);
    const options = isWalletAccount(accountOrPair) ? { signer: accountOrPair.signer as any } : {};

    const release = await this.apiComponents!.mutex.lock(address);
    const nonce = await this.apiComponents!.api.rpc.system.accountNextIndex(address);
    console.log(`Nonce for ${getAddressForFormat(address, this.apiComponents!.ss58Format)} is ${nonce.toString()}`);

    const stellarPkBytes = Uint8Array.from(stellarPkBytesBuffer);

    return new Promise<SpacewalkRedeemRequestEvent>((resolve, reject) =>
      this.apiComponents!.api.tx.redeem.requestRedeem(amount, stellarPkBytes, this.vaultId!)
        .signAndSend(addressOrPair, options, (submissionResult: ISubmittableResult) => {
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
              reject(this.handleDispatchError(dispatchError, systemExtrinsicFailedEvent, 'Redeem Request'));
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
                return event.redeemer === getAddressForFormat(accountOrPair.address, this.apiComponents!.ss58Format);
              });

            if (event.length == 0) {
              reject(new Error(`No redeem event found for account ${accountOrPair.address}`));
            }
            //we should only find one event corresponding to the issue request
            if (event.length != 1) {
              reject(new Error('Inconsistent amount of redeem request events for account'));
            }
            resolve(event[0]);
          }
        })
        .catch((error) => {
          reject(new Error(`Failed to request redeem: ${error}`));
        })
        .finally(() => release()),
    );
  }

  // We first check if dispatchError is of type "module",
  // If not we either return ExtrinsicFailedError or Unknown dispatch error
  handleDispatchError(dispatchError: any, systemExtrinsicFailedEvent: any, extrinsicCalled: any) {
    if (dispatchError?.isModule) {
      const decoded = this.apiComponents!.api.registry.findMetaError(dispatchError.asModule);
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
