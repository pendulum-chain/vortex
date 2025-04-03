import { ArrowDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
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
import {
  useOfframpActions,
  useOfframpExecutionInput,
  useOfframpState,
  useOfframpSummaryVisible,
} from '../../stores/offrampStore';
import { useTranslation } from 'react-i18next';
import { useSep24StoreCachedAnchorUrl } from '../../stores/sep24Store';
import { useOfframp } from '../../hooks/offramp/form/useOfframp';

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
  partnerUrl: string;
}

const FeeDetails = ({
  network,
  feesCost,
  fiatSymbol,
  fromToken,
  toToken,
  exchangeRate,
  partnerUrl,
}: FeeDetailsProps) => {
  const { t } = useTranslation();

  return (
    <section className="mt-6">
      <div className="flex justify-between mb-2">
        <p>
          {t('components.dialogs.OfframpSummaryDialog.offrampFee')} ({`${toToken.offrampFeesBasisPoints / 100}%`}
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
        <p>{t('components.dialogs.OfframpSummaryDialog.quote')}</p>
        <p>
          <strong>
            <ExchangeRate exchangeRate={exchangeRate} fromToken={fromToken} toTokenSymbol={fiatSymbol} />
          </strong>
        </p>
      </div>
      <div className="flex justify-between">
        <p>{t('components.dialogs.OfframpSummaryDialog.partner')}</p>
        <a href={partnerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          {partnerUrl}
        </a>
      </div>
    </section>
  );
};

export const OfframpSummaryDialog = () => {
  // state
  const executionInput = useOfframpExecutionInput();
  const anchorUrl = useSep24StoreCachedAnchorUrl();
  const visible = useOfframpSummaryVisible();
  const { setOfframpExecutionInput, setOfframpInitiating, setOfframpStarted, setOfframpSummaryVisible } =
    useOfframpActions();
  const { selectedNetwork } = useNetwork();
  const offrampState = useOfframpState();

  const [isSubmitted, setIsSubmitted] = useState(false);
  const { t } = useTranslation();

  //@TODO:
  const { handleOfframpSubmit } = useOfframp();

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
        partnerUrl={isStellarOutputTokenDetails(toToken) ? toToken.anchorHomepageUrl : toToken.partnerUrl}
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
        handleOfframpSubmit();
        toToken.type !== 'moonbeam' ? open(anchorUrl, '_blank') : null;
      }}
    >
      {offrampState !== undefined ? (
        <>
          <Spinner /> {t('components.dialogs.OfframpSummaryDialog.processing')}
        </>
      ) : isSubmitted ? (
        <>
          <Spinner /> {t('components.dialogs.OfframpSummaryDialog.continueOnPartnersPage')}
        </>
      ) : toToken.type !== 'moonbeam' ? (
        <>
          {t('components.dialogs.OfframpSummaryDialog.continueWithPartner')}{' '}
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </>
      ) : (
        <>{t('components.dialogs.OfframpSummaryDialog.continue')}</>
      )}
    </button>
  );

  return (
    <Dialog
      content={content}
      visible={visible}
      actions={actions}
      headerText={t('components.dialogs.OfframpSummaryDialog.headerText')}
      onClose={() => {
        setIsSubmitted(false);
        setOfframpExecutionInput(undefined);
        setOfframpStarted(false);
        setOfframpInitiating(false);
        setOfframpSummaryVisible(false);
      }}
    />
  );
};
