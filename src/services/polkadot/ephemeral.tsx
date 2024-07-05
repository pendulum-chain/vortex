import { Keyring } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { getApiManagerInstance } from './polkadotApi';
import { parseTokenTransferEvent, TokenTransferEvent } from './eventParsers';
import { compareObjects } from './eventParsers';
import { getAddressForFormat } from '../../helpers/addressFormatter';
let keypair: KeyringPair | null = null;
const MIN_BALANCE_NATIVE = 1000000000;

export const getEphemeralAccount = () => {
  if (!keypair) {
    const seedPhrase = mnemonicGenerate();
    const keyring = new Keyring({ type: 'sr25519' });
    keypair = keyring.addFromUri(seedPhrase);
  }
  return keypair;
};

export const fundEphemeralAccount = async () => {
  try {
    const pendulumApiComponents = await getApiManagerInstance();
    const apiData = pendulumApiComponents.apiData!;

    const ephemeralAddress = getEphemeralAccount().address;

    const seedPhrase = 'hood protect select grace number hurt lottery property stomach grit bamboo field';
    const keyring = new Keyring({ type: 'sr25519' });
    keypair = keyring.addFromUri(seedPhrase);

    await apiData.api.tx.balances
      .transfer(ephemeralAddress, MIN_BALANCE_NATIVE)
      .signAndSend(keypair.address);
  } catch (error) {
    console.error('Error funding account', error);
  }
};

// function to check balance of account, native token
export async function checkBalance(): Promise<boolean> {
  const pendulumApiComponents = await getApiManagerInstance();
  if (!keypair) {
    return false;
  }
  const { data: balance } = await pendulumApiComponents.apiData!.api.query.system.account(keypair?.address);

  // check if balance is higher than minimum required, then we consider the account ready
  return balance.free.toNumber() > MIN_BALANCE_NATIVE;
}

export async function waitForTokenReceptionEvent(
  expectedCurrencyId: any,
  maxWaitingTimeMs: number,
): Promise<TokenTransferEvent> {
  const pendulumApiComponents = await getApiManagerInstance();
  const ephemeralAddress = getEphemeralAccount().address;
  const apiData = pendulumApiComponents.apiData!;

  const filter = (event: any) => {
    if (event.event.section === 'tokens' && event.event.method === 'Transfer') {
      const eventParsed = parseTokenTransferEvent(event);
      if (eventParsed.to != getAddressForFormat(ephemeralAddress, apiData.ss58Format)) {
        return null;
      }
      if (compareObjects(eventParsed.currencyId, expectedCurrencyId)) {
        return eventParsed;
      }
    }
    return null;
  };

  return new Promise((resolve, reject) => {
    let unsubscribeFromEventsPromise: Promise<() => void> | null = null;
    const timeout = setTimeout(() => {
      if (unsubscribeFromEventsPromise) {
        unsubscribeFromEventsPromise.then((unsubscribe) => unsubscribe());
      }
      reject(new Error(`Max waiting time exceeded for token reception`));
    }, maxWaitingTimeMs);

    unsubscribeFromEventsPromise = apiData.api.query.system.events((events) => {
      events.forEach((event) => {
        const eventParsed = filter(event);
        if (eventParsed) {
          if (unsubscribeFromEventsPromise) {
            unsubscribeFromEventsPromise.then((unsubscribe) => unsubscribe());
          }
          clearTimeout(timeout);
          resolve(eventParsed);
        }
      });
    });
  });
}
