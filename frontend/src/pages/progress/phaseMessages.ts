
import { FiatToken, getAnyFiatTokenDetails, getNetworkDisplayName, getNetworkFromDestination, getOnChainTokenDetailsOrDefault, isNetworkEVM, Networks, OnChainToken, RampPhase } from 'shared';
import { RampState } from '../../types/phases';
import { TFunction } from 'i18next';

export function getMessageForPhase(ramp: RampState | undefined, t: TFunction<'translation', undefined>): string {
  if (!ramp || !ramp.ramp) return t('pages.progress.initial');

  const currentState = ramp.ramp!;
  const quote = ramp.quote;
  const currentPhase = currentState.currentPhase;

  const fromNetwork = getNetworkFromDestination(quote.from);
  const toNetwork = getNetworkFromDestination(quote.to);

  const inputAssetSymbol =
    currentState.type === 'off'
      ? getOnChainTokenDetailsOrDefault(fromNetwork!, quote.inputCurrency as OnChainToken).assetSymbol
      : getAnyFiatTokenDetails(quote.inputCurrency as FiatToken).assetSymbol;
  const outputAssetSymbol =
    currentState.type === 'off'
      ? getAnyFiatTokenDetails(quote.outputCurrency as FiatToken).assetSymbol
      : getOnChainTokenDetailsOrDefault(toNetwork!, quote.outputCurrency as OnChainToken).assetSymbol;

  if (currentPhase === 'complete') return t('pages.progress.success');

  const getSwappingMessage = () => t('pages.progress.swappingTo', { assetSymbol: outputAssetSymbol });
  const getMoonbeamToPendulumMessage = () => t('pages.progress.moonbeamToPendulum', { assetSymbol: inputAssetSymbol });
  const getSquidrouterSwapMessage = () =>
    t('pages.progress.squidrouterSwap', { assetSymbol: outputAssetSymbol, network: toNetwork });

  const getTransferringMessage = () => t('pages.progress.transferringToLocalPartner');

  const messages: Record<RampPhase, string> = {
    initial: t('pages.progress.initial'),
    stellarCreateAccount: t('pages.progress.createStellarAccount'),
    fundEphemeral: t('pages.progress.fundEphemeral'),
    nablaApprove: getSwappingMessage(),
    nablaSwap: getSwappingMessage(),
    subsidizePreSwap: getSwappingMessage(),
    subsidizePostSwap: getSwappingMessage(),
    moonbeamToPendulum: getMoonbeamToPendulumMessage(),
    moonbeamToPendulumXcm: getMoonbeamToPendulumMessage(),
    assethubToPendulum: t('pages.progress.assethubToPendulum', { assetSymbol: inputAssetSymbol }),
    pendulumToMoonbeam: t('pages.progress.pendulumToMoonbeam', { assetSymbol: outputAssetSymbol }),
    spacewalkRedeem: t('pages.progress.executeSpacewalkRedeem', { assetSymbol: outputAssetSymbol }),
    brlaPayoutOnMoonbeam: getTransferringMessage(),
    stellarPayment: t('pages.progress.stellarPayment', { assetSymbol: outputAssetSymbol }),
    squidrouterApprove: getSquidrouterSwapMessage(),
    squidrouterSwap: getSquidrouterSwapMessage(),
    pendulumToAssethub: t('pages.progress.pendulumToAssethub', { assetSymbol: outputAssetSymbol }),
    brlaTeleport: t('pages.progress.brlaTeleport'),
    failed: '', // Not relevant for progress page
    complete: '', // Not relevant for progress page
    timedOut: '', // Not relevant for progress page
  };

  return messages[currentPhase];
}
