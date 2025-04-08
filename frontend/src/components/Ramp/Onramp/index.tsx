import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FormProvider } from 'react-hook-form';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails } from 'shared';

import { LabeledInput } from '../../LabeledInput';
import { BrlaSwapFields } from '../../BrlaComponents/BrlaSwapFields';
import { AssetNumericInput } from '../../AssetNumericInput';
import { BenefitsList } from '../../BenefitsList';
import { useEventsContext } from '../../../contexts/events';
import { useNetwork } from '../../../contexts/network';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useQuoteService } from '../../../hooks/ramp/useQuoteService';
import { useRampValidation } from '../../../hooks/ramp/useRampValidation';
import { useRampSubmission } from '../../../hooks/ramp/useRampSubmission';
import { useFeeComparisonStore } from '../../../stores/feeComparison';
import { useRampForm } from '../../../hooks/ramp/useRampForm';
import { RampTerms } from '../../RampTerms';
import { useValidateTerms } from '../../../stores/termsStore';
import { useRampModalActions } from '../../../stores/rampModalStore';
import { useInputAmount, useOnChainToken, useFiatToken } from '../../../stores/ramp/useRampFormStore';
import { useRampUrlParams } from '../../../hooks/useRampUrlParams';
import { RampFeeCollapse } from '../../RampFeeCollapse';
import { RampSubmitButtons } from '../../RampSubmitButtons';
import { useRampTokenConstraints } from '../../../hooks/ramp/useRampTokenConstraints';

export const Onramp = () => {
  useRampTokenConstraints();
  const { setTrackPrice } = useFeeComparisonStore();

  const { form } = useRampForm();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();

  const { outputAmount: toAmount } = useQuoteService(inputAmount, onChainToken, fiatToken);

  // TODO: This is a hack to get the output amount to the form
  useEffect(() => {
    form.setValue('outputAmount', toAmount?.toString() || '0');
  }, [toAmount, form]);

  const { getCurrentErrorMessage, initializeFailedMessage } = useRampValidation();
  const { onSwapConfirm } = useRampSubmission();
  const validateTerms = useValidateTerms();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);

  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const { openTokenSelectModal } = useRampModalActions();

  const fromToken = getAnyFiatTokenDetails(fiatToken);
  const toToken = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);

  const debouncedInputAmount = useDebouncedValue(inputAmount, 1000);

  useRampUrlParams({ form });

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

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          registerInput={form.register('inputAmount')}
          tokenSymbol={fromToken.fiat.symbol}
          assetIcon={fromToken.fiat.assetIcon}
          onClick={() => openTokenSelectModal('from')}
          onChange={handleInputChange}
          id="inputAmount"
        />
      </>
    ),
    [form, fromToken, openTokenSelectModal, handleInputChange],
  );

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.networkAssetIcon}
        tokenSymbol={toToken.assetSymbol}
        onClick={() => openTokenSelectModal('to')}
        registerInput={form.register('outputAmount')}
        disabled={!toAmount}
        readOnly={true}
        id="outputAmount"
      />
    ),
    [toToken, form, toAmount, openTokenSelectModal],
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
        <LabeledInput label="You pay" htmlFor="fromAmount" Input={WithdrawNumericInput} />
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
