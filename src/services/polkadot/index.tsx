import { Keypair } from 'stellar-sdk';
import { ApiManager } from './polkadotApi';
import { getVaultsForCurrency, VaultService } from './spacewalk';
import { prettyPrintVaultId } from './spacewalk';
import { stringDecimalToStellarNative } from '../../helpers/parseNumbers';
import { EventListener } from './eventListener';
import { EventStatus } from '../../components/GenericEvent';
import { OUTPUT_TOKEN_CONFIG, OutputTokenDetails } from '../../constants/tokenConfig';
import { checkStellarBalance } from '../stellar/utils';
import Big from 'big.js';
import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { Keyring } from '@polkadot/api';

export async function executeSpacewalkRedeem(
  state: OfframpingState,
  { renderEvent }: ExecutionContext,
): Promise<OfframpingState> {
  const { outputAmount, stellarEphemeralSecret, pendulumEphemeralSeed, outputTokenType } = state;
  const amountStringRaw = outputAmount.raw;
  const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];

  const pendulumApiComponents = await new ApiManager().getApiComponents();
  const { ss58Format, api } = pendulumApiComponents;

  // get ephermal keypair and account
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  const stellarEphemeralKeypair = Keypair.fromSecret(stellarEphemeralSecret);
  const stellarTargetAccountId = stellarEphemeralKeypair.publicKey();

  // We wait for up to 10 minutes
  const maxWaitingTimeMinutes = 10;
  const maxWaitingTimeMs = maxWaitingTimeMinutes * 60 * 1000;
  const stellarPollingTimeMs = 1 * 1000;

  // One of these two values must exist
  const vaultsForCurrency = await getVaultsForCurrency(api, outputToken.stellarAsset.code.hex);
  if (vaultsForCurrency.length === 0) {
    throw new Error(`No vaults found for currency ${outputToken.stellarAsset.code.string}`);
  }
  const targetVaultId = vaultsForCurrency[0].id;
  const vaultService = new VaultService(targetVaultId, pendulumApiComponents);

  // We currently charge 0 fees for redeem requests on Spacewalk so the amount is the same as the requested amount
  const amountUnits = stringDecimalToStellarNative(amountStringRaw).toString();
  const amountRawBig = new Big(amountStringRaw);
  // Generate raw public key for target
  const stellarTargetKeypair = Keypair.fromPublicKey(stellarTargetAccountId);
  const stellarTargetAccountIdRaw = stellarTargetKeypair.rawPublicKey();

  // Recovery guard. If the operation was shut before the redeem was executed (we didn't register the event) we can
  // avoid sending it again.
  // We check for stellar funds.
  const someBalance = await checkStellarBalance(stellarTargetAccountId, outputToken.stellarAsset.code.string);
  if (someBalance.lt(amountRawBig)) {
    let redeemRequestEvent;

    try {
      renderEvent(
        `Requesting redeem of ${amountUnits} tokens for vault ${prettyPrintVaultId(targetVaultId)}`,
        EventStatus.Waiting,
      );
      redeemRequestEvent = await vaultService.requestRedeem(ephemeralKeypair, amountUnits, stellarTargetAccountIdRaw);

      console.log(
        `Successfully posed redeem request ${redeemRequestEvent.redeemId} for vault ${prettyPrintVaultId(
          targetVaultId,
        )}`,
      );
      //Render event that the extrinsic passed, and we are now waiting for the execution of it

      const eventListener = EventListener.getEventListener(pendulumApiComponents.api);

      renderEvent(
        `Redeem request passed, waiting up to ${maxWaitingTimeMinutes} minutes for redeem execution event...`,
        EventStatus.Waiting,
      );

      try {
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
        try {
          await checkBalancePeriodically(
            stellarTargetAccountId,
            outputToken,
            amountRawBig,
            stellarPollingTimeMs,
            maxWaitingTimeMs,
          );
          console.log('Balance check completed successfully.');
        } catch (balanceCheckError) {
          throw new Error(`Stellar balance did not arrive on time`);
        }
      } else {
        // Generic failure of the extrinsic itself OR lack of funds to even make the transaction
        console.log(`Failed to request redeem: ${error}`);
        throw new Error(`Failed to request redeem`);
      }
    }
  }

  renderEvent('Redeem process completed, executing offramp transaction', EventStatus.Waiting);
  return { ...state, phase: 'pendulumCleanup' };
}

function checkBalancePeriodically(
  stellarTargetAccountId: string,
  outputToken: OutputTokenDetails,
  amountDesiredBig: Big,
  intervalMs: number,
  timeoutMs: number,
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const intervalId = setInterval(async () => {
      try {
        const someBalance = await checkStellarBalance(stellarTargetAccountId, outputToken.stellarAsset.code.string);
        console.log(`Balance check: ${someBalance.toString()} / ${amountDesiredBig.toString()}`);

        if (someBalance.gte(amountDesiredBig)) {
          clearInterval(intervalId);
          resolve(someBalance);
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
