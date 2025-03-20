import {
  getInputTokenDetails,
  getOutputTokenDetails,
  isStellarOutputTokenDetails,
} from '../../../../constants/tokenConfig';
import { getVaultsForCurrency } from '../../../../services/phases/polkadot/spacewalk';
import { testRoute } from '../../../../services/phases/squidrouter/route';
import { useOfframpStore } from '../../../../stores/offrampStore';
import { getSubaccount, getSubaccountUsedLimit } from '../../../../services/signingService';

async function isOfframpAmountWithinAllowedLimits(amount: string, subaccountTaxId: string) {
  const { subaccountData } = await getSubaccount(subaccountTaxId);
  if (!subaccountData) {
    throw new Error('Subaccount not found');
  }

  const usedLimit = await getSubaccountUsedLimit(subaccountData.id);
  if (!usedLimit) {
    throw new Error(`Unable to query used limits for account ${subaccountData.id}`);
  }

  const userBurnLimitOverall = subaccountData.limits.limitBurn;
  const userBurnLimitUsed = usedLimit.limitBurn;
  const remainingBurnLimit = userBurnLimitOverall - userBurnLimitUsed;

  console.log(
    'userBurnLimitOverall: ',
    userBurnLimitOverall,
    'userBurnLimitUsed: ',
    userBurnLimitUsed,
    'remainingBurnLimit: ',
    remainingBurnLimit,
  );

  return parseFloat(amount) <= remainingBurnLimit;
}

export const performSwapInitialChecks = async () => {
  const offrampState = useOfframpStore.getState();
  const {
    api,
    outputTokenType,
    outputAmountUnits,
    taxId,
    inputTokenType,
    network,
    address,
    requiresSquidRouter,
    expectedRedeemAmountRaw,
    inputAmountRaw,
  } = offrampState.offrampExecutionInput!;
  const outputTokenDetails = getOutputTokenDetails(outputTokenType);
  const inputTokenDetails = getInputTokenDetails(network, inputTokenType)!;

  if (isStellarOutputTokenDetails(outputTokenDetails)) {
    await Promise.all([
      getVaultsForCurrency(
        api,
        outputTokenDetails.stellarAsset.code.hex,
        outputTokenDetails.stellarAsset.issuer.hex,
        expectedRedeemAmountRaw,
      ),
      requiresSquidRouter ? testRoute(inputTokenDetails, inputAmountRaw, address, network) : Promise.resolve(),
    ]);
  } else {
    if (outputTokenDetails.pendulumAssetSymbol === 'BRLA') {
      if (!taxId) {
        throw new Error('No tax ID found for KYC process');
      }
      await isOfframpAmountWithinAllowedLimits(outputAmountUnits.beforeFees, taxId);
    }
    await (requiresSquidRouter ? testRoute(inputTokenDetails, inputAmountRaw, address, network) : Promise.resolve());
  }
};
