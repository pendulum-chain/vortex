import { Keypair } from 'stellar-sdk';
import { ApiManager } from './polkadotApi';
import { getVaultsForCurrency, VaultService } from './spacewalk';
import { prettyPrintVaultId } from './spacewalk';
import { stringDecimalToStellarNative } from '../../helpers/parseNumbers';
import { EventListener } from './eventListener';
import { EventStatus } from '../../components/GenericEvent';
import { WalletAccount } from '@talismn/connect-wallets';
import { KeyringPair } from '@polkadot/keyring/types';
import { TokenDetails } from '../../constants/tokenConfig';

export async function executeSpacewalkRedeem(
  stellarTargetAccountId: string,
  amountString: string,
  accountOrPair: WalletAccount | KeyringPair,
  tokenConfig: TokenDetails,
  renderEvent: (event: string, status: EventStatus) => void,
) {

  const pendulumApiComponents = await new ApiManager().getApiComponents();
  // Query all available vaults for the currency
  // we give priority again to the hex string, since we know the vault will match against this value
  // in case the asset is represented as this if the asset is 3 letter.
  const assetCodeOrHex = tokenConfig.assetCodeHex || tokenConfig.assetCode;
  
  // One of these two values must exist
  const vaultsForCurrency = await getVaultsForCurrency(pendulumApiComponents.api, assetCodeOrHex!);
  if (vaultsForCurrency.length === 0) {
    throw new Error(`No vaults found for currency ${assetCodeOrHex}`);
  }
  const targetVaultId = vaultsForCurrency[0].id;
  const vaultService = new VaultService(targetVaultId, pendulumApiComponents);

  // We currently charge 0 fees for redeem requests on Spacewalk so the amount is the same as the requested amount
  const amountRaw = stringDecimalToStellarNative(amountString).toString();
  // Generate raw public key for target
  const stellarTargetKeypair = Keypair.fromPublicKey(stellarTargetAccountId);
  const stellarTargetAccountIdRaw = stellarTargetKeypair.rawPublicKey();

  console.log(`Requesting redeem of ${amountRaw} tokens for vault ${prettyPrintVaultId(targetVaultId)}`);

  let redeemRequestEvent;
  try {
    renderEvent(
      `Requesting redeem of ${amountRaw} tokens for vault ${prettyPrintVaultId(
        targetVaultId,
      )}. Please sign the transaction`,
      EventStatus.Waiting,
    );
    redeemRequestEvent = await vaultService.requestRedeem(accountOrPair, amountRaw, stellarTargetAccountIdRaw);
  } catch (error) {
    // Generic failure of the extrinsic itself OR lack of funds to even make the transaction
    renderEvent(`Failed to request redeem: ${error}`, EventStatus.Error);
    console.log(`Failed to request redeem: ${error}`);
    throw new Error(`Failed to request redeem`);
  }

  console.log(
    `Successfully posed redeem request ${redeemRequestEvent.redeemId} for vault ${prettyPrintVaultId(targetVaultId)}`,
  );
  //Render event that the extrinsic passed, and we are now waiting for the execution of it

  const eventListener = EventListener.getEventListener(pendulumApiComponents.api);
  // We wait for up to 5 minutes
  const maxWaitingTimeMin = 5;
  const maxWaitingTimeMs = maxWaitingTimeMin * 60 * 1000;

  renderEvent(
    `Redeem request passed, waiting up to ${maxWaitingTimeMin} minutes for redeem execution event...`,
    EventStatus.Waiting,
  );

  try {
    const redeemEvent = await eventListener.waitForRedeemExecuteEvent(redeemRequestEvent.redeemId, maxWaitingTimeMs);
  } catch (error) {
    // This is a potentially recoverable error (due to network delay)
    // in the future we should distinguish between recoverable and non-recoverable errors
    console.log(`Failed to wait for redeem execution: ${error}`);
    renderEvent(`Failed to wait for redeem execution: Max waiting time exceeded`, EventStatus.Error);
    throw new Error(`Failed to wait for redeem execution`);
  }
}
