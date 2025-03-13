import { OfframpingPhase } from '../../services/offrampingFlow';

import {
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  isStellarOutputTokenDetails,
} from '../../constants/tokenConfig';
import { Networks, isNetworkEVM, getNetworkDisplayName } from '../../helpers/networks';
import { OfframpingState } from '../../services/offrampingFlow';
import { useTranslation } from 'react-i18next';

export function useCreateOfframpingPhaseMessage(offrampingState: OfframpingState, networkName: Networks): string {
  const { assetSymbol } = getInputTokenDetailsOrDefault(networkName, offrampingState.inputTokenType);
  const outputTokenDetails = getOutputTokenDetails(offrampingState.outputTokenType);
  const { phase } = offrampingState;
  const { t } = useTranslation();
  const network = getNetworkDisplayName(networkName);
  const isEVM = isNetworkEVM(networkName);

  if (phase === 'success') return t('pages.progress.success');

  const getBridgingMessage = () =>
    isEVM
      ? t('pages.progress.bridgingEVM', { assetSymbol, network })
      : t('pages.progress.bridgingAssetHub', { assetSymbol });

  const getSwappingMessage = () => t('pages.progress.swappingTo', { assetSymbol: outputTokenDetails.fiat.symbol });

  const getTransferringMessage = () => t('pages.progress.transferringToLocalPartner');

  const messages: Record<OfframpingPhase, string> = {
    prepareTransactions: getBridgingMessage(),
    squidRouter: getBridgingMessage(),
    pendulumFundEphemeral: getBridgingMessage(),

    executeMoonbeamToPendulumXCM: t('pages.progress.executeMoonbeamToPendulumXCM', { assetSymbol }),
    executeAssetHubToPendulumXCM: t('pages.progress.bridgingAssetHub', { assetSymbol }),
    executePendulumToMoonbeamXCM: t('pages.progress.executePendulumToMoonbeamXCM', { assetSymbol }),

    subsidizePreSwap: getSwappingMessage(),
    nablaApprove: getSwappingMessage(),
    nablaSwap: getSwappingMessage(),
    subsidizePostSwap: getSwappingMessage(),

    executeSpacewalkRedeem: isStellarOutputTokenDetails(outputTokenDetails)
      ? t('pages.progress.executeSpacewalkRedeem', { assetSymbol: outputTokenDetails.stellarAsset.code.string })
      : '',

    pendulumCleanup: getTransferringMessage(),
    stellarOfframp: getTransferringMessage(),
    stellarCleanup: getTransferringMessage(),
    performBrlaPayoutOnMoonbeam: getTransferringMessage(),
  };

  return messages[phase as OfframpingPhase];
}
