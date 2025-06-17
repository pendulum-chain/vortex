import { SpacewalkPrimitivesVaultId } from '@pendulum-chain/types/interfaces';
import { SubmittableExtrinsic } from '@polkadot/api-base/types';

import { SpacewalkRedeemRequestEvent, getAddressForFormat, parseEventRedeemRequest } from '@packages/shared';
import { DispatchError, EventRecord } from '@polkadot/types/interfaces';
import { ISubmittableResult } from '@polkadot/types/types';
import logger from '../../../config/logger';
import { API } from '../pendulum/apiManager';
import { getVaultsForCurrency } from './getVaults';

export async function createVaultService(
  apiComponents: API,
  assetCodeHex: string,
  assetIssuerHex: string,
  redeemAmountRaw: string,
) {
  const { api, ss58Format, decimals } = apiComponents;
  // we expect the list to have at least one vault, otherwise getVaultsForCurrency would throw
  const vaultsForCurrency = await getVaultsForCurrency(api, assetCodeHex, assetIssuerHex, redeemAmountRaw);
  const targetVaultId = vaultsForCurrency[0].id;
  return new VaultService(targetVaultId, { api, ss58Format, decimals });
}

export class VaultService {
  vaultId: SpacewalkPrimitivesVaultId;

  apiComponents: API;

  constructor(vaultId: SpacewalkPrimitivesVaultId, apiComponents: API) {
    this.vaultId = vaultId;
    this.apiComponents = apiComponents;
  }

  async createRequestRedeemExtrinsic(amountRaw: string, stellarPkBytesBuffer: Buffer) {
    const stellarPkBytes = Uint8Array.from(stellarPkBytesBuffer);
    return this.apiComponents.api.tx.redeem.requestRedeem(amountRaw, stellarPkBytes, this.vaultId);
  }

  async submitRedeem(
    senderAddress: string,
    extrinsic: SubmittableExtrinsic<'promise'>,
  ): Promise<SpacewalkRedeemRequestEvent> {
    return new Promise((resolve, reject) => {
      extrinsic
        .send((submissionResult: ISubmittableResult) => {
          const { status, events, dispatchError } = submissionResult;

          if (status.isFinalized) {
            logger.info(`Requested redeem for vault ${this.vaultId} with status ${status.type}`);

            // Try to find a 'system.ExtrinsicFailed' event
            const systemExtrinsicFailedEvent = events.find(
              (record) => record.event.section === 'system' && record.event.method === 'ExtrinsicFailed',
            );

            if (dispatchError) {
              reject(this.handleDispatchError(dispatchError, systemExtrinsicFailedEvent, 'Redeem Request'));
            }
            // find all redeem request events and filter the one that matches the requester
            const redeemEvents = events.filter(
              (event) =>
                event.event.section.toLowerCase() === 'redeem' && event.event.method.toLowerCase() === 'requestredeem',
            );

            const event = redeemEvents
              .map((event) => parseEventRedeemRequest(event))
              .filter((event) => event.redeemer === getAddressForFormat(senderAddress, this.apiComponents?.ss58Format));

            if (event.length == 0) {
              reject(new Error(`No redeem event found for account ${senderAddress}`));
            }
            // we should only find one event corresponding to the issue request
            if (event.length != 1) {
              reject(new Error('Inconsistent amount of redeem request events for account'));
            }
            resolve(event[0]);
          }
        })
        .catch((error) => {
          reject(new Error(`Failed to request redeem: ${error}`));
        });
    });
  }

  // We first check if dispatchError is of type "module",
  // If not we either return ExtrinsicFailedError or Unknown dispatch error
  handleDispatchError(
    dispatchError: DispatchError,
    systemExtrinsicFailedEvent: EventRecord | undefined,
    extrinsicCalled: unknown,
  ) {
    if (dispatchError?.isModule) {
      const decoded = this.apiComponents?.api.registry.findMetaError(dispatchError.asModule);
      const { name, section, method } = decoded;

      return new Error(`Dispatch error: ${section}.${method}:: ${name}`);
    }
    if (systemExtrinsicFailedEvent) {
      const eventName =
        systemExtrinsicFailedEvent?.event.data && systemExtrinsicFailedEvent?.event.data.length > 0
          ? systemExtrinsicFailedEvent?.event.data[0].toString()
          : 'Unknown';

      const {
        phase,
        event: { method, section },
      } = systemExtrinsicFailedEvent;
      logger.error(`Extrinsic failed in phase ${phase.toString()} with ${section}.${method}:: ${eventName}`);

      return new Error(`Failed to dispatch ${extrinsicCalled}`);
    }

    logger.error('Encountered some other error: ', dispatchError?.toString(), JSON.stringify(dispatchError));
    return new Error(`Unknown error during ${extrinsicCalled}`);
  }
}
