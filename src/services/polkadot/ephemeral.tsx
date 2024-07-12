import { Keyring } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { getApiManagerInstance } from './polkadotApi';
import { parseTokenDepositEvent, TokenTransferEvent } from './eventParsers';
import { compareObjects } from './eventParsers';
import { getAddressForFormat } from '../../helpers/addressFormatter';
import { decimalToNative } from '../../helpers/parseNumbers';
import { TokenType } from '../../constants/tokenConfig';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { TRANSFER_WAITING_TIME_SECONDS } from '../../constants/constants';
import Big from 'big.js';
import { storageService } from '../localStorage';
import { storageKeys } from '../../constants/localStorage';

let ephemeralAccountKeypair: KeyringPair | null = null;
const FUNDING_AMOUNT = decimalToNative(0.1).toNumber(); // 0.1 PEN
// TODO: replace
const SEED_PHRASE = 'hood protect select grace number hurt lottery property stomach grit bamboo field';

// print the public key using the correct ss58 format
async function printEphemeralAccount(seedPhrase: string) {
  const { apiData } = await getApiManagerInstance();
  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData?.ss58Format });
  ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);
  console.log('Ephemeral account seedphrase: ', seedPhrase);
  console.log('Ephemeral account created:', ephemeralAccountKeypair.address);
}

export const getEphemeralAccount = () => {
  if (!ephemeralAccountKeypair) {
    const seedPhrase = mnemonicGenerate();
    const keyring = new Keyring({ type: 'sr25519' });
    ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);
    printEphemeralAccount(seedPhrase);

    // store the seed phrase in local storage
    storageService.set(storageKeys.PENDULUM_SEED, seedPhrase);
  }
  return ephemeralAccountKeypair;
};

export const recoverEphemeralAccount = async () => {
  const seedPhrase = storageService.get(storageKeys.PENDULUM_SEED);
  if (!seedPhrase) {
    throw new Error('Pendulum seed phrase not found in local storage');
  }

  const keyring = new Keyring({ type: 'sr25519' });
  ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);
  printEphemeralAccount(seedPhrase);
}

export const fundEphemeralAccount = async () => {
  try {
    const pendulumApiComponents = await getApiManagerInstance();
    const apiData = pendulumApiComponents.apiData!;

    const ephemeralAddress = getEphemeralAccount().address;

    const keyring = new Keyring({ type: 'sr25519' });
    const fundingAccountKeypair = keyring.addFromUri(SEED_PHRASE);

    await apiData.api.tx.balances.transfer(ephemeralAddress, FUNDING_AMOUNT).signAndSend(fundingAccountKeypair);
  } catch (error) {
    console.error('Error funding account', error);
  }
};

export const cleanEphemeralAccount = async (token: TokenType) => {
  try {
    const pendulumApiComponents = await getApiManagerInstance();
    const apiData = pendulumApiComponents.apiData!;

    const ephemeralKeyring = getEphemeralAccount();

    const keyring = new Keyring({ type: 'sr25519' });
    const fundingAccountKeypair = keyring.addFromUri(SEED_PHRASE);
    const fundingAccountAddress = getAddressForFormat(fundingAccountKeypair.address, apiData.ss58Format);

    // probably will never be exactly '0', but to be safe
    // TODO: if the value is too small, do we really want to transfer token dust and spend fees?
    await apiData.api.tx.tokens
      .transferAll(fundingAccountAddress, TOKEN_CONFIG[token].currencyId, false)
      .signAndSend(ephemeralKeyring);

    await apiData.api.tx.balances.transferAll(fundingAccountAddress, false).signAndSend(ephemeralKeyring);

    // to be safe, storage will be cleaned anyway 
    storageService.set(storageKeys.PENDULUM_SEED, undefined);
  } catch (error) {
    console.error('Error cleaning pendulum ephemeral account', error);
  }
};

// function to check balance of account, native token
export async function checkBalance(): Promise<boolean> {
  const pendulumApiComponents = await getApiManagerInstance();
  if (!ephemeralAccountKeypair) {
    return false;
  }
  const { data: balance } = await pendulumApiComponents.apiData!.api.query.system.account(
    ephemeralAccountKeypair?.address,
  );

  // check if balance is higher than minimum required, then we consider the account ready
  return balance.free.toNumber() >= FUNDING_AMOUNT;
}

export async function checkEphemeralReady(tokenToReceive: TokenType, expectedBalanceRaw: Big): Promise<Big> {
  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;

  const ephemeralKeyring = getEphemeralAccount();
  const ephemeralAddress = getAddressForFormat(ephemeralKeyring.address, apiData.ss58Format);

  // since this could be triggered after a recovery, we first
  // check if the tokens are actually there. Otherwise the event will never be triggered
  const response = (
    await apiData.api.query.tokens.accounts(ephemeralAddress, TOKEN_CONFIG[tokenToReceive].currencyId)
  ).toHuman() as any;
  const rawBalanceString = response?.free || '0';
  const rawBalance = new Big(rawBalanceString.toString()) as Big;

  if (rawBalance.gte(expectedBalanceRaw)) {
    console.log('Token already received, continuing...');
    return rawBalance;
  }

  // This is the normal path, where we wait for the token to be received
  console.log('Waiting to receive token: ', tokenToReceive);
  const tokenTransferEvent = await waitForTokenReceptionEvent(tokenToReceive, TRANSFER_WAITING_TIME_SECONDS * 1000);
  console.log('token received', tokenTransferEvent);

  // check if the token received is the expected amount
  if (tokenTransferEvent.amountRaw.lt(expectedBalanceRaw)) {
    throw new Error('Expected token balance received on ephemeral too low');
  }

  // call checkBalance until it returns true. Funding operation.
  let ready;
  do {
    ready = await checkBalance();
  } while (!ready);

  return tokenTransferEvent.amountRaw;
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
