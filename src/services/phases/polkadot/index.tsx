import { Keypair } from 'stellar-sdk';
import { Keyring } from '@polkadot/api';
import { Extrinsic } from '@pendulum-chain/api-solang';
import Big from 'big.js';

import { getTokenDetailsSpacewalk, StellarTokenDetails } from '../../../constants/tokenConfig';
import { ApiComponents } from '../../../contexts/polkadotNode';
import { getStellarBalanceUnits } from '../stellar/utils';
import { getEphemeralNonce } from './ephemeral';
import { decodeSubmittableExtrinsic } from '../signedTransactions';
import { getVaultsForCurrency, prettyPrintVaultId, VaultService } from './spacewalk';
import { isOfframpState, OfframpingState } from '../../offrampingFlow';
import { ExecutionContext, FlowState } from '../../flowCommons';
import { EventListener } from './eventListener';
import { isSpacewalkOfframpTransactions } from '../../../types/offramp';

async function createVaultService(
  apiComponents: ApiComponents,
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

export async function prepareSpacewalkRedeemTransaction(
  state: OfframpingState,
  context: ExecutionContext,
): Promise<Extrinsic> {
  const { pendulumNode } = context;

  if (!pendulumNode) {
    throw new Error('Pendulum node not available');
  }

  const { outputAmount, stellarEphemeralSecret, pendulumEphemeralSeed, outputTokenType, executeSpacewalkNonce } = state;

  if (!stellarEphemeralSecret) {
    throw new Error('Stellar ephemeral secret not available');
  }

  const outputToken = getTokenDetailsSpacewalk(outputTokenType);
  const { ss58Format } = pendulumNode;

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  const stellarEphemeralKeypair = Keypair.fromSecret(stellarEphemeralSecret);
  const stellarTargetAccountId = stellarEphemeralKeypair.publicKey();
  // Generate raw public key for target
  const stellarTargetKeypair = Keypair.fromPublicKey(stellarTargetAccountId);
  const stellarTargetAccountIdRaw = stellarTargetKeypair.rawPublicKey();

  try {
    const vaultService = await createVaultService(
      pendulumNode,
      outputToken.stellarAsset.code.hex,
      outputToken.stellarAsset.issuer.hex,
      outputAmount.raw,
    );
    console.log(
      `Preparing transaction for redeem request of ${outputAmount.units} tokens for vault ${prettyPrintVaultId(
        vaultService.vaultId,
      )}`,
    );

    return await vaultService.createRequestRedeemExtrinsic(
      ephemeralKeypair,
      outputAmount.raw,
      stellarTargetAccountIdRaw,
      executeSpacewalkNonce,
    );
  } catch (e) {
    console.error('Error in prepareSpacewalkRedeemTransaction: ', e);
  }
  throw Error("Couldn't create redeem extrinsic");
}

export async function executeSpacewalkRedeem(state: FlowState, context: ExecutionContext): Promise<FlowState> {
  const { pendulumNode } = context;

  if (!pendulumNode) {
    throw new Error('Pendulum node not available');
  }

  if (!isOfframpState(state)) {
    throw new Error('executeMoonbeamToPendulumXCM: State must be an offramp state');
  }

  const {
    transactions,
    outputTokenType,
    outputAmount,
    pendulumEphemeralSeed,
    stellarEphemeralSecret,
    executeSpacewalkNonce,
  } = state;
  const outputToken = getTokenDetailsSpacewalk(outputTokenType);

  if (!transactions || !stellarEphemeralSecret || !executeSpacewalkNonce) {
    const message = 'Invalid state. Missing values.';
    console.error(message);
    return { ...state, failure: { type: 'unrecoverable', message } };
  }

  const successorState = {
    ...state,
    phase: 'pendulumCleanup',
  } as const;

  // We wait for up to 10 minutes
  const maxWaitingTimeMinutes = 10;
  const maxWaitingTimeMs = maxWaitingTimeMinutes * 60 * 1000;

  const waitForOutputTokensToArriveOnStellar = async () => {
    const amountUnitsBig = new Big(outputAmount.units);
    const stellarEphemeralKeypair = Keypair.fromSecret(stellarEphemeralSecret);
    const stellarTargetAccountId = stellarEphemeralKeypair.publicKey();
    const stellarPollingTimeMs = 1000;

    try {
      await checkBalancePeriodically(
        stellarTargetAccountId,
        outputToken,
        amountUnitsBig,
        stellarPollingTimeMs,
        maxWaitingTimeMs,
      );
      console.log('Balance check completed successfully.');
    } catch (balanceCheckError) {
      throw new Error(`Stellar balance did not arrive on time`);
    }
  };

  const ephemeralAccountNonce = await getEphemeralNonce(state, context);
  if (ephemeralAccountNonce !== undefined && ephemeralAccountNonce > executeSpacewalkNonce) {
    await waitForOutputTokensToArriveOnStellar();
    return successorState;
  }

  if (!transactions || !isSpacewalkOfframpTransactions(transactions)) {
    const message = 'Transactions not prepared, cannot execute Spacewalk redeem';
    console.error(message);
    return { ...state, failure: { type: 'unrecoverable', message } };
  }
  let redeemRequestEvent;

  const { ss58Format, api } = pendulumNode;

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  try {
    const vaultService = await createVaultService(
      pendulumNode,
      outputToken.stellarAsset.code.hex,
      outputToken.stellarAsset.issuer.hex,
      outputAmount.raw,
    );
    console.log(
      `Requesting redeem of ${outputAmount.units} tokens for vault ${prettyPrintVaultId(vaultService.vaultId)}`,
    );

    const redeemExtrinsic = decodeSubmittableExtrinsic(transactions.spacewalkRedeemTransaction, api);
    redeemRequestEvent = await vaultService.submitRedeem(ephemeralKeypair.address, redeemExtrinsic);

    console.log(
      `Successfully posed redeem request ${redeemRequestEvent.redeemId} for vault ${prettyPrintVaultId(
        vaultService.vaultId,
      )}`,
    );

    // Render event that the extrinsic passed, and we are now waiting for the execution of it
    console.log(`Redeem request passed, waiting up to ${maxWaitingTimeMinutes} minutes for redeem execution event...`);

    try {
      const eventListener = EventListener.getEventListener(api);
      await eventListener.waitForRedeemExecuteEvent(redeemRequestEvent.redeemId, maxWaitingTimeMs);
    } catch (error) {
      // This is a potentially recoverable error (due to network delay)
      // in the future we should distinguish between recoverable and non-recoverable errors
      console.log(`Failed to wait for redeem execution: ${error}`);
      console.log(`Failed to wait for redeem execution: Max waiting time exceeded`);
      throw new Error(`Failed to wait for redeem execution`);
    }
  } catch (error) {
    // This is a potentially recoverable error (due to redeem request done before app shut down, but not registered)
    if ((error as Error).message.includes('AmountExceedsUserBalance')) {
      console.log(`Recovery mode: Redeem already performed. Waiting for execution and Stellar balance arrival.`);
      await waitForOutputTokensToArriveOnStellar();
    } else {
      // Generic failure of the extrinsic itself OR lack of funds to even make the transaction
      console.log(`Failed to request redeem: ${error}`);
      throw new Error(`Failed to request redeem`);
    }
  }

  console.log('Redeem process completed, executing offramp transaction');
  return successorState;
}

function checkBalancePeriodically(
  stellarTargetAccountId: string,
  outputToken: StellarTokenDetails,
  amountDesiredUnitsBig: Big,
  intervalMs: number,
  timeoutMs: number,
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const intervalId = setInterval(async () => {
      try {
        const someBalanceUnits = await getStellarBalanceUnits(
          stellarTargetAccountId,
          outputToken.stellarAsset.code.string,
        );
        console.log(`Balance check: ${someBalanceUnits.toString()} / ${amountDesiredUnitsBig.toString()}`);

        if (someBalanceUnits.gte(amountDesiredUnitsBig)) {
          clearInterval(intervalId);
          resolve(someBalanceUnits);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(intervalId);
          reject(new Error(`Balance did not meet the limit within the specified time (${timeoutMs} ms)`));
        }
      } catch (error) {
        console.error('Error checking balance:', error);
        // Don't clear the interval here, allow it to continue checking
      }
    }, intervalMs);

    // Set a timeout to reject the promise if the total time exceeds timeoutMs
    setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error(`Balance did not meet the limit within the specified time (${timeoutMs} ms)`));
    }, timeoutMs);
  });
}
