import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FormProvider } from 'react-hook-form';

import { LabeledInput } from '../../LabeledInput';
import { BrlaSwapFields } from '../../BrlaComponents/BrlaSwapFields';
import { AssetNumericInput } from '../../AssetNumericInput';
import { UserBalance } from '../../UserBalance';
import { BenefitsList } from '../../BenefitsList';
import { useEventsContext } from '../../../contexts/events';
import { useNetwork } from '../../../contexts/network';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails } from 'shared';
import { useQuoteService } from '../../../hooks/ramp/useQuoteService';
import { useRampValidation } from '../../../hooks/ramp/useRampValidation';
import { useRampSubmission } from '../../../hooks/ramp/useRampSubmission';
import { useFeeComparisonStore } from '../../../stores/feeComparison';
import { useRampForm } from '../../../hooks/ramp/useRampForm';
import { RampTerms } from '../../RampTerms';
import { useValidateTerms } from '../../../stores/termsStore';
import { useRampModalActions } from '../../../stores/rampModalStore';
import { useInputAmount, useOnChainToken, useFiatToken } from '../../../stores/ramp/useRampFormStore';
import { useSwapUrlParams } from '../../../hooks/useRampUrlParams';
import { RampFeeCollapse } from '../../RampFeeCollapse';
import { RampSubmitButtons } from '../../RampSubmitButtons';

export const Offramp = () => {
  const { setTrackPrice } = useFeeComparisonStore();

  const { form } = useRampForm();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();

  const { outputAmount: toAmount } = useQuoteService(inputAmount, onChainToken, fiatToken);
  const { getCurrentErrorMessage, initializeFailedMessage } = useRampValidation();
  const { onSwapConfirm } = useRampSubmission();
  const validateTerms = useValidateTerms();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);

  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const { openTokenSelectModal } = useRampModalActions();

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const toToken = getAnyFiatTokenDetails(fiatToken);

  const debouncedInputAmount = useDebouncedValue(inputAmount, 1000);

  useSwapUrlParams({ form });

  useEffect(() => {
    if (!fromAmountFieldTouched || debouncedInputAmount !== inputAmount) return;

    trackEvent({
      event: 'amount_type',
      input_amount: debouncedInputAmount ? debouncedInputAmount.toString() : '0',
    });
  }, [fromAmountFieldTouched, debouncedInputAmount, inputAmount, trackEvent]);

  const handleInputChange = useCallback(() => {
    setFromAmountFieldTouched(true);
    setTrackPrice(true);
  }, [setTrackPrice]);

  const handleBalanceClick = useCallback((amount: string) => form.setValue('inputAmount', amount), [form]);

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          registerInput={form.register('inputAmount')}
          tokenSymbol={fromToken.assetSymbol}
          assetIcon={fromToken.networkAssetIcon}
          onClick={() => openTokenSelectModal('from')}
          onChange={handleInputChange}
          id="inputAmount"
        />
        <UserBalance token={fromToken} onClick={handleBalanceClick} />
      </>
    ),
    [form, fromToken, openTokenSelectModal, handleInputChange, handleBalanceClick],
  );

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.fiat.assetIcon}
        tokenSymbol={toToken.fiat.symbol}
        onClick={() => openTokenSelectModal('to')}
        registerInput={form.register('outputAmount')}
        disabled={!toAmount}
        readOnly={true}
        id="outputAmount"
      />
    ),
    [toToken.fiat.assetIcon, toToken.fiat.symbol, form, toAmount, openTokenSelectModal],
  );

  const handleConfirm = useCallback(() => {
    if (!validateTerms()) {
      return;
    }

    onSwapConfirm();
  }, [onSwapConfirm, validateTerms]);

  return (
    <FormProvider {...form}>
      <motion.form onSubmit={form.handleSubmit(handleConfirm)}>
        <LabeledInput label="You sell" htmlFor="fromAmount" Input={WithdrawNumericInput} />
        <div className="my-10" />
        <LabeledInput label="You receive" htmlFor="toAmount" Input={ReceiveNumericInput} />
        <p className="mb-6 text-red-600">{getCurrentErrorMessage()}</p>
        <RampFeeCollapse />
        <section className="flex items-center justify-center w-full mt-5">
          <BenefitsList amount={inputAmount} currency={onChainToken} />
        </section>
        <BrlaSwapFields />
        {initializeFailedMessage && (
          <section className="flex justify-center w-full mt-5">
            <div className="flex items-center gap-4">
              <p className="text-red-600">{initializeFailedMessage}</p>
            </div>
          </section>
        )}
        <section className="w-full mt-5">
          <RampTerms />
        </section>
        <RampSubmitButtons toAmount={toAmount} />
      </motion.form>
    </FormProvider>
  );
};
