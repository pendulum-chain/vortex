import { FC } from 'react';
import Big from 'big.js';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../Dialog';
import { useRampActions, useRampExecutionInput, useRampSummaryVisible } from '../../stores/rampStore';
import { useFiatToken, useOnChainToken } from '../../stores/ramp/useRampFormStore';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';
import { useNetwork } from '../../contexts/network';
import { RampDirection } from '../RampToggle';
import { TransactionTokensDisplay } from './TransactionTokensDisplay';
import { RampSummaryButton } from './RampSummaryButton';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { SigningBoxButton, SigningBoxContent } from '../SigningBox/SigningBoxContent';
import { useSigningBoxState } from '../../hooks/useSigningBoxState';
import { usePartnerId } from '../../stores/partnerStore';

export const RampSummaryDialog: FC = () => {
  const { t } = useTranslation();
  const { selectedNetwork } = useNetwork();
  const { resetRampState } = useRampActions();
  const executionInput = useRampExecutionInput();
  const visible = useRampSummaryVisible();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { quote, fetchQuote } = useQuoteStore();
  const partnerId = usePartnerId();

  const { shouldDisplay: signingBoxVisible, progress, signatureState, confirmations } = useSigningBoxState();

  if (!visible) return null;
  if (!executionInput) return null;

  const onClose = () => {
    resetRampState();
    fetchQuote({
      rampType: isOnramp ? 'on' : 'off',
      inputAmount: Big(quote?.inputAmount || '0'),
      onChainToken,
      fiatToken,
      selectedNetwork,
      partnerId: partnerId === null ? undefined : partnerId, // Handle null case
    });
  };

  const headerText = isOnramp
    ? t('components.dialogs.RampSummaryDialog.headerText.buy')
    : t('components.dialogs.RampSummaryDialog.headerText.sell');

  const actions = signingBoxVisible ? (
    <SigningBoxButton signatureState={signatureState} confirmations={confirmations} />
  ) : (
    <RampSummaryButton />
  );

  const content = (
    <>
      <TransactionTokensDisplay executionInput={executionInput} isOnramp={isOnramp} rampDirection={rampDirection} />

      {signingBoxVisible && (
        <div className="mt-6 max-w-[320px] mx-auto">
          <SigningBoxContent progress={progress} />
        </div>
      )}
    </>
  );

  return <Dialog content={content} visible={visible} actions={actions} headerText={headerText} onClose={onClose} />;
};
