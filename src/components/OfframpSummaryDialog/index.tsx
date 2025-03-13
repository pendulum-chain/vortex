import { ArrowDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { useState, FC } from 'react';
import Big from 'big.js';

import {
  getInputTokenDetailsOrDefault,
  InputTokenDetails,
  BaseOutputTokenDetails,
  isStellarOutputTokenDetails,
  getOutputTokenDetails,
  OutputTokenTypes,
} from '../../constants/tokenConfig';
import { useGetAssetIcon } from '../../hooks/useGetAssetIcon';
import { useOfframpFees } from '../../hooks/useOfframpFees';
import { useNetwork } from '../../contexts/network';
import { Networks } from '../../helpers/networks';

import { ExchangeRate } from '../ExchangeRate';
import { NetworkIcon } from '../NetworkIcon';
import { Dialog } from '../Dialog';
import { Spinner } from '../Spinner';
import { OfframpExecutionInput } from '../../types/offramp';
import { useOfframpActions, useOfframpState } from '../../stores/offrampStore';
import { useTranslation } from 'react-i18next';

interface AssetDisplayProps {
  amount: string;
  symbol: string;
  iconSrc: string;
  iconAlt: string;
}

const AssetDisplay = ({ amount, symbol, iconSrc, iconAlt }: AssetDisplayProps) => (
  <div className="flex items-center justify-between w-full">
    <span className="text-lg font-bold">
      {amount} {symbol}
    </span>
    <img src={iconSrc} alt={iconAlt} className="w-8 h-8" />
  </div>
);

interface FeeDetailsProps {
  network: Networks;
  feesCost: string;
  fiatSymbol: string;
  exchangeRate: string;
  fromToken: InputTokenDetails;
  toToken: BaseOutputTokenDetails;
  anchorUrl: string;
}

const FeeDetails = ({
  network,
  feesCost,
  fiatSymbol,
  fromToken,
  toToken,
  exchangeRate,
  anchorUrl,
}: FeeDetailsProps) => {
  const { t } = useTranslation();

  return (
    <section className="mt-6">
      <div className="flex justify-between mb-2">
        <p>
          {t('pages.swap.components.dialogs.OfframpSummaryDialog.offrampFee')} (
          {`${toToken.offrampFeesBasisPoints / 100}%`}
          {toToken.offrampFeesFixedComponent ? ` + ${toToken.offrampFeesFixedComponent} ${fiatSymbol}` : ''})
        </p>
        <p className="flex items-center gap-2">
          <NetworkIcon network={network} className="w-4 h-4" />
          <strong>
            {feesCost} {fiatSymbol}
          </strong>
        </p>
      </div>
      <div className="flex justify-between mb-2">
        <p>{t('pages.swap.components.dialogs.OfframpSummaryDialog.quote')}</p>
        <p>
          <strong>
            <ExchangeRate exchangeRate={exchangeRate} fromToken={fromToken} toTokenSymbol={fiatSymbol} />
          </strong>
        </p>
      </div>
      <div className="flex justify-between">
        <p>{t('pages.swap.components.dialogs.OfframpSummaryDialog.partner')}</p>
        <a href={anchorUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          {anchorUrl}
        </a>
      </div>
    </section>
  );
};

interface OfframpSummaryDialogProps {
  anchorUrl?: string;
  executionInput?: OfframpExecutionInput;
  visible: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export const OfframpSummaryDialog: FC<OfframpSummaryDialogProps> = ({
  anchorUrl,
  executionInput,
  visible,
  onClose,
  onSubmit,
}) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { selectedNetwork } = useNetwork();
  const { setOfframpExecutionInput, setOfframpInitiating, setOfframpStarted } = useOfframpActions();
  const offrampState = useOfframpState();
  const { t } = useTranslation();

  // We use some defaults here to avoid issues with conditional calls to react hooks. This is safe because the
  // component will not render if the executionInput is undefined.
  const fromToken = getInputTokenDetailsOrDefault(selectedNetwork, executionInput?.inputTokenType || 'usdc');
  const fromIcon = useGetAssetIcon(fromToken.networkAssetIcon);
  const toToken = getOutputTokenDetails(executionInput?.outputTokenType || OutputTokenTypes.EURC);
  const toIcon = useGetAssetIcon(toToken.fiat.assetIcon);

  const toAmount = Big(executionInput?.outputAmountUnits.afterFees || 0);
  const { feesCost } = useOfframpFees(toAmount, toToken);

  if (!visible) return null;
  if (!anchorUrl && toToken.type === 'spacewalk') return null;
  if (!executionInput?.brlaEvmAddress && toToken.type === 'moonbeam') return null;
  if (!executionInput) return null;

  const content = (
    <div className="flex flex-col justify-center">
      <AssetDisplay
        iconAlt={fromToken.networkAssetIcon}
        symbol={fromToken.assetSymbol}
        amount={executionInput.inputAmountUnits}
        iconSrc={fromIcon}
      />
      <ArrowDownIcon className="w-4 h-4 my-2" />
      <AssetDisplay
        amount={executionInput.outputAmountUnits.afterFees}
        symbol={toToken.fiat.symbol}
        iconSrc={toIcon}
        iconAlt={toToken.fiat.symbol}
      />
      <FeeDetails
        fiatSymbol={toToken.fiat.symbol}
        fromToken={fromToken}
        toToken={toToken}
        anchorUrl={isStellarOutputTokenDetails(toToken) ? toToken.anchorHomepageUrl : toToken.anchorUrl}
        exchangeRate={executionInput.effectiveExchangeRate}
        network={selectedNetwork}
        feesCost={feesCost}
      />
    </div>
  );
  const actions = (
    <button
      disabled={isSubmitted}
      className="btn-vortex-primary btn rounded-xl"
      style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
      onClick={() => {
        setIsSubmitted(true);
        onSubmit();
        toToken.type !== 'moonbeam' ? open(anchorUrl, '_blank') : null;
      }}
    >
      {offrampState !== undefined ? (
        <>
          <Spinner /> {t('pages.swap.components.dialogs.OfframpSummaryDialog.processing')}
        </>
      ) : isSubmitted ? (
        <>
          <Spinner /> {t('pages.swap.components.dialogs.OfframpSummaryDialog.continueOnPartnersPage')}
        </>
      ) : toToken.type !== 'moonbeam' ? (
        <>
          {t('pages.swap.components.dialogs.OfframpSummaryDialog.continueWithPartner')}{' '}
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </>
      ) : (
        <>{t('pages.swap.components.dialogs.OfframpSummaryDialog.continue')}</>
      )}
    </button>
  );

  return (
    <Dialog
      content={content}
      visible={visible}
      actions={actions}
      headerText={t('pages.swap.components.dialogs.OfframpSummaryDialog.headerText')}
      onClose={() => {
        setIsSubmitted(false);
        setOfframpExecutionInput(undefined);
        setOfframpStarted(false);
        setOfframpInitiating(false);
        onClose();
      }}
    />
  );
};
