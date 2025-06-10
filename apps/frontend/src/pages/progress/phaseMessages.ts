import {
  FiatToken,
  OnChainToken,
  RampPhase,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetailsOrDefault,
} from '@packages/shared';
import { TFunction } from 'i18next';
import { RampState } from '../../types/phases';

export function getMessageForPhase(ramp: RampState | undefined, t: TFunction<'translation', undefined>): string {
  if (!ramp || !ramp.ramp) return t('pages.progress.initial');

  const currentState = ramp.ramp;
  const quote = ramp.quote;
  const currentPhase = currentState.currentPhase;

  const fromNetwork = getNetworkFromDestination(quote.from);
  const toNetwork = getNetworkFromDestination(quote.to);

  const inputAssetSymbol =
    currentState.type === 'off'
      ? fromNetwork
        ? getOnChainTokenDetailsOrDefault(fromNetwork, quote.inputCurrency as OnChainToken).assetSymbol
        : 'Unknown' // Fallback when network is undefined
      : getAnyFiatTokenDetails(quote.inputCurrency as FiatToken).assetSymbol;

  const outputAssetSymbol =
    currentState.type === 'off'
      ? getAnyFiatTokenDetails(quote.outputCurrency as FiatToken).assetSymbol
      : toNetwork
        ? getOnChainTokenDetailsOrDefault(toNetwork, quote.outputCurrency as OnChainToken).assetSymbol
        : 'Unknown'; // Fallback when network is undefined

  if (currentPhase === 'complete') return t('pages.progress.success');

  const getSwappingMessage = () => t('pages.progress.swappingTo', { assetSymbol: outputAssetSymbol });
  const getMoonbeamToPendulumMessage = () => t('pages.progress.moonbeamToPendulum', { assetSymbol: inputAssetSymbol });
  const getSquidrouterSwapMessage = () =>
    t('pages.progress.squidRouterSwap', {
      assetSymbol: outputAssetSymbol,
      network: toNetwork,
    });

  const getTransferringMessage = () => t('pages.progress.transferringToLocalPartner');

  const messages: Record<RampPhase, string> = {
    initial: t('pages.progress.initial'),
    stellarCreateAccount: t('pages.progress.createStellarAccount'),
    fundEphemeral: t('pages.progress.fundEphemeral'),
    distributeFees: getSwappingMessage(),
    nablaApprove: getSwappingMessage(),
    nablaSwap: getSwappingMessage(),
    subsidizePreSwap: getSwappingMessage(),
    subsidizePostSwap: getSwappingMessage(),
    moonbeamToPendulum: getMoonbeamToPendulumMessage(),
    moonbeamToPendulumXcm: getMoonbeamToPendulumMessage(),
    assethubToPendulum: t('pages.progress.assethubToPendulum', {
      assetSymbol: inputAssetSymbol,
    }),
    pendulumToMoonbeam: t('pages.progress.pendulumToMoonbeam', {
      assetSymbol: outputAssetSymbol,
    }),
    spacewalkRedeem: t('pages.progress.executeSpacewalkRedeem', {
      assetSymbol: outputAssetSymbol,
    }),
    brlaPayoutOnMoonbeam: getTransferringMessage(),
    stellarPayment: t('pages.progress.stellarPayment', {
      assetSymbol: outputAssetSymbol,
    }),
    squidRouterApprove: getSquidrouterSwapMessage(),
    squidRouterSwap: getSquidrouterSwapMessage(),
    squidRouterPay: getSquidrouterSwapMessage(),
    pendulumToAssethub: t('pages.progress.pendulumToAssethub', {
      assetSymbol: outputAssetSymbol,
    }),
    brlaTeleport: t('pages.progress.brlaTeleport'),
    failed: '', // Not relevant for progress page
    complete: '', // Not relevant for progress page
    timedOut: '', // Not relevant for progress page
  };

  return messages[currentPhase];
}
