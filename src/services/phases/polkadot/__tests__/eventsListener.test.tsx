import { describe, expect, it } from 'vitest';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { EventListener } from '../eventListener';
import { ASSETHUB_WSS, PENDULUM_WSS } from '../../../../constants/constants';
import { hexToString, stellarHexToPublic } from '../convert';

export class TestableEventListener extends EventListener {
  constructor(api: ApiPromise) {
    super(api);
    // We DO NOT WANT to actually subscribe, for testing.
    this.unsubscribe();
  }

  // Analogous to what we would do in the callback of the subscription
  processEventsForTest(events: any[]) {
    events.forEach((event) => {
      this.processEvents(event, this.pendingRedeemEvents);
      this.processEvents(event, this.pendingXcmSentEvents);
    });
  }
}

async function getEventsFromBlock(api: ApiPromise, blockHash: string) {
  const at = await api.at(blockHash);
  const events = await at.query.system.events();
  return events;
}
// Tests for EventListener's filters  and parseEvent functions, specifically: Redeem.ExecuteRedeem and PolkadotXcm.Sent events.
// Request redeem event parser is tested in spacewalk.test.tsx.
describe('EventListener Tests', () => {
  it('should detect successful polkadotXcm.Sent event', async () => {
    const XCM_SENT_EVENT_BLOCK_HASH = '0xbac62e758e09f7e51fae2c74a8766c7e5e57a224d4a9ca8828e782ed9754340e';
    const ORIGIN_XCM_ACCOUNT = '5DqTNJsGp6UayR5iHAZvH4zquY6ni6j35ZXLtJA6bXwsfixg';

    const provider = new WsProvider(ASSETHUB_WSS);
    const api = await ApiPromise.create({ provider });

    const events = await getEventsFromBlock(api, XCM_SENT_EVENT_BLOCK_HASH);

    const listener = new TestableEventListener(api);

    const promise = listener.waitForXcmSentEvent(ORIGIN_XCM_ACCOUNT, 50000000); // We're not testing for timeout, so we set a high value.

    // Bypass subscription and directly process the events
    listener.processEventsForTest(events);

    await expect(promise).resolves.toMatchObject({
      originAddress: ORIGIN_XCM_ACCOUNT,
    });
  });

  it('should detect successful ExecuteRedeem Event', async () => {
    const EXECUTE_REDEEM_EVENT_BLOCK_HASH = '0x8c8dc97201be2fdc3aa050218a866e809aa0f2770a5e6dc413e41966c37d493a';
    const REDEEM_ID = '0xa6c042f8816aaddd148fb2d24176312ca9a65bb331617fdfd33f8573a20e921e';
    const REDEEMER = '6g7GLX4eBUCswt8ZaU3qkwntcu1NxkALZbyB4t1oU2WeKDFk';
    const VAULT_ID = {
      accountId: '6bE2vjpLRkRNoVDqDtzokxE34QdSJC2fz7c87R9yCVFFDNWs',
      currencies: {
        collateral: {
          XCM: 10,
        },
        wrapped: {
          Stellar: {
            AlphaNum4: {
              code: hexToString('0x41525300'),
              issuer: stellarHexToPublic('0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1'),
            },
          },
        },
      },
    };
    const AMOUNT = 538780000000000;
    const ASSET = {
      Stellar: {
        AlphaNum4: {
          code: hexToString('0x41525300'),
          issuer: stellarHexToPublic('0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1'),
        },
      },
    };
    const FEE = 0;
    const TRANSFER_FEE = 0;

    const provider = new WsProvider(PENDULUM_WSS);
    const api = await ApiPromise.create({ provider });

    const events = await getEventsFromBlock(api, EXECUTE_REDEEM_EVENT_BLOCK_HASH);

    const listener = new TestableEventListener(api);

    const promise = listener.waitForRedeemExecuteEvent(REDEEM_ID, 50000000);

    listener.processEventsForTest(events);
    await expect(promise).resolves.toMatchObject({
      redeemId: REDEEM_ID,
      redeemer: REDEEMER,
      vaultId: VAULT_ID,
      amount: AMOUNT,
      asset: ASSET,
      fee: FEE,
      transferFee: TRANSFER_FEE,
    });
  });
});
