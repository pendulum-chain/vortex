import { Keyring } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { getApiManagerInstance } from './polkadotApi';
import { parseTokenDepositEvent, TokenTransferEvent } from './eventParsers';
import { compareObjects } from './eventParsers';
import { getAddressForFormat } from '../../helpers/addressFormatter';
import { decimalToNative } from '../../helpers/parseNumbers';

let fundingAccountKeypair: KeyringPair | null = null;
const FUNDING_AMOUNT = decimalToNative(0.1).toNumber(); // 0.1 PEN

// print the public key using the correct ss58 format
async function printEphemeralAccount(seedPhrase: string) {
  const { apiData } = await getApiManagerInstance();
  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData?.ss58Format });
  fundingAccountKeypair = keyring.addFromUri(seedPhrase);
  console.log('Ephemeral account seedphrase: ', seedPhrase);
  console.log('Ephemeral account created:', fundingAccountKeypair.address);
}

export const getEphemeralAccount = () => {
  if (!fundingAccountKeypair) {
    const seedPhrase = mnemonicGenerate();
    const keyring = new Keyring({ type: 'sr25519' });
    fundingAccountKeypair = keyring.addFromUri(seedPhrase);
    printEphemeralAccount(seedPhrase);
  }
  return fundingAccountKeypair;
};

export const fundEphemeralAccount = async () => {
  try {
    const pendulumApiComponents = await getApiManagerInstance();
    const apiData = pendulumApiComponents.apiData!;

    const ephemeralAddress = getEphemeralAccount().address;

    // TODO: replace
    const seedPhrase = 'hood protect select grace number hurt lottery property stomach grit bamboo field';
    const keyring = new Keyring({ type: 'sr25519' });
    const fundingAccountKeypair = keyring.addFromUri(seedPhrase);

    await apiData.api.tx.balances.transfer(ephemeralAddress, FUNDING_AMOUNT).signAndSend(fundingAccountKeypair);
  } catch (error) {
    console.error('Error funding account', error);
  }
};

// function to check balance of account, native token
export async function checkBalance(): Promise<boolean> {
  const pendulumApiComponents = await getApiManagerInstance();
  if (!fundingAccountKeypair) {
    return false;
  }
  const { data: balance } = await pendulumApiComponents.apiData!.api.query.system.account(
    fundingAccountKeypair?.address,
  );

  // check if balance is higher than minimum required, then we consider the account ready
  return balance.free.toNumber() >= FUNDING_AMOUNT;
}

export async function waitForTokenReceptionEvent(
  expectedCurrencyId: any,
  maxWaitingTimeMs: number,
): Promise<TokenTransferEvent> {
  const pendulumApiComponents = await getApiManagerInstance();
  const ephemeralAddress = getEphemeralAccount().address;
  const apiData = pendulumApiComponents.apiData!;

  const filter = (event: any) => {
    if (event.event.section === 'tokens' && event.event.method === 'Deposited') {
      console.log('Deposit Event:', event);
      const eventParsed = parseTokenDepositEvent(event);
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
