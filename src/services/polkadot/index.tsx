/* eslint-disable @typescript-eslint/no-explicit-any */
import { Keypair } from 'stellar-sdk';
import { ApiComponents, ApiManager } from './polkadotApi';
import { getVaultsForCurrency, prettyPrintVaultId, VaultService } from './spacewalk';
import { EventListener } from './eventListener';
import { EventStatus } from '../../components/GenericEvent';
import { OUTPUT_TOKEN_CONFIG, OutputTokenDetails } from '../../constants/tokenConfig';
import { getStellarBalanceUnits } from '../stellar/utils';
import Big from 'big.js';
import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { Keyring } from '@polkadot/api';
import { Extrinsic } from '@pendulum-chain/api-solang';
import { decodeSubmittableExtrinsic } from '../signedTransactions';
import { getEphemeralNonce } from './ephemeral';

async function createVaultService(
  apiComponents: ApiComponents,
  assetCodeHex: string,
  assetIssuerHex: string,
  redeemAmountRaw: string,
) {
  // we expect the list to have at least one vault, otherwise getVaultsForCurrency would throw
  const vaultsForCurrency = await getVaultsForCurrency(
    apiComponents.api,
    assetCodeHex,
    assetIssuerHex,
    redeemAmountRaw,
  );
  const targetVaultId = vaultsForCurrency[0].id;
  return new VaultService(targetVaultId, apiComponents);
}

export async function prepareSpacewalkRedeemTransaction(
  state: OfframpingState,
  { renderEvent }: ExecutionContext,
): Promise<Extrinsic> {
  const { outputAmount, stellarEphemeralSecret, pendulumEphemeralSeed, outputTokenType, executeSpacewalkNonce } = state;
  const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];

  const pendulumApiComponents = await new ApiManager().getApiComponents();
  const { ss58Format } = pendulumApiComponents;

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
      pendulumApiComponents,
      outputToken.stellarAsset.code.hex,
      outputToken.stellarAsset.issuer.hex,
      outputAmount.raw,
    );
    renderEvent(
      `Requesting redeem of ${outputAmount.units} tokens for vault ${prettyPrintVaultId(vaultService.vaultId)}`,
      EventStatus.Waiting,
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

export async function executeSpacewalkRedeem(
  state: OfframpingState,
  { renderEvent }: ExecutionContext,
): Promise<OfframpingState> {
  const {
    transactions,
    outputTokenType,
    outputAmount,
    pendulumEphemeralSeed,
    stellarEphemeralSecret,
    executeSpacewalkNonce,
  } = state;
  const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];

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

  const ephemeralAccountNonce = await getEphemeralNonce(state);
  if (ephemeralAccountNonce !== undefined && ephemeralAccountNonce > executeSpacewalkNonce) {
    await waitForOutputTokensToArriveOnStellar();
    return successorState;
  }

  if (!transactions) {
    console.error('Transactions not prepared, cannot execute Spacewalk redeem');
    return { ...state, failure: 'unrecoverable' };
  }
  let redeemRequestEvent;

  const pendulumApiComponents = await new ApiManager().getApiComponents();
  const { ss58Format, api } = pendulumApiComponents;

  // get ephemeral keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  try {
    const vaultService = await createVaultService(
      pendulumApiComponents,
      outputToken.stellarAsset.code.hex,
      outputToken.stellarAsset.issuer.hex,
      outputAmount.raw,
    );
    renderEvent(
      `Requesting redeem of ${outputAmount.units} tokens for vault ${prettyPrintVaultId(vaultService.vaultId)}`,
      EventStatus.Waiting,
    );

    const redeemExtrinsic = decodeSubmittableExtrinsic(transactions.spacewalkRedeemTransaction, api);
    redeemRequestEvent = await vaultService.submitRedeem(ephemeralKeypair.address, redeemExtrinsic);

    console.log(
      `Successfully posed redeem request ${redeemRequestEvent.redeemId} for vault ${prettyPrintVaultId(
        vaultService.vaultId,
      )}`,
    );

    // Render event that the extrinsic passed, and we are now waiting for the execution of it
    renderEvent(
      `Redeem request passed, waiting up to ${maxWaitingTimeMinutes} minutes for redeem execution event...`,
      EventStatus.Waiting,
    );

    try {
      const eventListener = EventListener.getEventListener(pendulumApiComponents.api);
      await eventListener.waitForRedeemExecuteEvent(redeemRequestEvent.redeemId, maxWaitingTimeMs);
    } catch (error) {
      // This is a potentially recoverable error (due to network delay)
      // in the future we should distinguish between recoverable and non-recoverable errors
      console.log(`Failed to wait for redeem execution: ${error}`);
      renderEvent(`Failed to wait for redeem execution: Max waiting time exceeded`, EventStatus.Error);
      throw new Error(`Failed to wait for redeem execution`);
    }
  } catch (error) {
    // This is a potentially recoverable error (due to redeem request done before app shut down, but not registered)
    if ((error as any).message.includes('AmountExceedsUserBalance')) {
      console.log(`Recovery mode: Redeem already performed. Waiting for execution and Stellar balance arrival.`);
      await waitForOutputTokensToArriveOnStellar();
    } else {
      // Generic failure of the extrinsic itself OR lack of funds to even make the transaction
      console.log(`Failed to request redeem: ${error}`);
      throw new Error(`Failed to request redeem`);
    }
  }

  renderEvent('Redeem process completed, executing offramp transaction', EventStatus.Waiting);
  return successorState;
}

function checkBalancePeriodically(
  stellarTargetAccountId: string,
  outputToken: OutputTokenDetails,
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
