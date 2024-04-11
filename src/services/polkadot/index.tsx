
import { Keypair } from "stellar-sdk";
import { ASSET_CODE, ASSET_ISSUER, EURC_VAULT_ACCOUNT_ID } from "../../constants/constants"
import { ApiManager } from "./polkadotApi";
import { VaultService } from "./spacewalk";
import { prettyPrintVaultId } from "./spacewalk";
import { decimalToStellarNative } from "../../helpers/parseNumbers";
import { EventListener } from "./eventListener";
export const ASSET_ISSUER_RAW = `0x${Keypair.fromPublicKey(ASSET_ISSUER).rawPublicKey().toString("hex")}`;

export async function executeSpacewalkRedeem(stellarTargetAccountId: any, amountString: string, pendulumSecret: string) {
    console.log("Executing Spacewalk redeem");
  
    const pendulumApi = await new ApiManager().getApi();
    // The Vault ID of the EURC vault
    let eurcVaultId = {
      accountId: EURC_VAULT_ACCOUNT_ID,
      currencies: {
        collateral: { XCM: 0 },
        wrapped: { Stellar: { AlphaNum4: { code: ASSET_CODE, issuer: ASSET_ISSUER_RAW } } },
      },
    };
    let vaultService = new VaultService(eurcVaultId, pendulumApi);
  
    // We currently charge 0 fees for redeem requests on Spacewalk so the amount is the same as the requested amount
    const amountRaw = decimalToStellarNative(amountString).toString();
    // Generate raw public key for target
    let stellarTargetKeypair = Keypair.fromPublicKey(stellarTargetAccountId);
    let stellarTargetAccountIdRaw = stellarTargetKeypair.rawPublicKey();
  
    console.log(`Requesting redeem of ${amountRaw} tokens for vault ${prettyPrintVaultId(eurcVaultId)}`);
    let redeemRequestEvent = await vaultService.requestRedeem(pendulumSecret, amountRaw, stellarTargetAccountIdRaw);
  
    console.log(
      `Successfully posed redeem request ${redeemRequestEvent.redeemId} for vault ${prettyPrintVaultId(eurcVaultId)}`
    );
  
    const eventListener = EventListener.getEventListener(pendulumApi.api);
    // We wait for up to 5 minutes
    const maxWaitingTimeMin = 5;
    const maxWaitingTimeMs = maxWaitingTimeMin * 60 * 1000;
    console.log(`Waiting up to ${maxWaitingTimeMin} minutes for redeem execution event...`);
  
    const redeemEvent = await eventListener.waitForRedeemExecuteEvent(redeemRequestEvent.redeemId, maxWaitingTimeMs);
  
    console.log(`Successfully redeemed ${redeemEvent.amount} tokens for vault ${prettyPrintVaultId(eurcVaultId)}`);
  }