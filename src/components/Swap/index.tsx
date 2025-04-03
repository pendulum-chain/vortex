import { useCallback, useEffect, useMemo, useState, useDeferredValue } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { FormProvider } from 'react-hook-form';

import { useSwapFromTokenDetails, useSwapModalActions, useSwapToTokenDetails } from '../../pages/swap/swapStore';
import { useSwapUrlParams } from '../../pages/swap/useSwapUrlParams';
import { useCalculateToken } from '../../pages/swap/hooks/useCalculateToken';
import { useOfframp } from '../../pages/swap/hooks/useOfframp';

import { useValidateTerms } from '../../stores/termsStore';
import { useEventsContext } from '../../contexts/events';

import { BrlaSwapFields } from '../BrlaComponents/BrlaSwapFields';
import { PoolSelectorModal } from '../InputKeys/SelectionModal';
import { SwapSubmitButton } from '../buttons/SwapSubmitButton';
import { AssetNumericInput } from '../AssetNumericInput';
import { BenefitsList } from '../BenefitsList';
import { LabeledInput } from '../LabeledInput';
import { PoweredBy } from '../PoweredBy';
import { SigningBox } from '../SigningBox';
import { UserBalance } from '../UserBalance';
import { useSwapForm } from '../Nabla/useSwapForm';

import { RampErrorMessage } from './RampErrorMessage';
import { RampFee } from './FeeCollapse';
import { TermsSection } from './RampTerms';

export const Swap = () => {
  const { t } = useTranslation();
  const { trackEvent } = useEventsContext();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);

  const validateTerms = useValidateTerms();

  const { openTokenSelectModal } = useSwapModalActions();
  const { form, fromAmount, from, to } = useSwapForm();
  const { onSwapConfirm } = useOfframp();

  useSwapUrlParams({ form });

  const fromToken = useSwapFromTokenDetails();
  const toToken = useSwapToTokenDetails();

  const { tokenOutAmount, inputAmountIsStable } = useCalculateToken(from, to, fromAmount?.toString() || '0', form);

  const deferredFromAmount = useDeferredValue(fromAmount);

  useEffect(() => {
    if (!fromAmountFieldTouched || deferredFromAmount !== fromAmount) return;

    trackEvent({
      event: 'amount_type',
      input_amount: deferredFromAmount ? deferredFromAmount.toString() : '0',
    });
  }, [fromAmountFieldTouched, deferredFromAmount, fromAmount, trackEvent]);

  const handleInputChange = useCallback(() => {
    setFromAmountFieldTouched(true);
  }, []);

  const handleBalanceClick = useCallback((amount: string) => form.setValue('fromAmount', amount), [form]);

  const WithdrawNumericInput = useMemo(() => {
    if (!fromToken) return null;

    return (
      <>
        <AssetNumericInput
          registerInput={form.register('fromAmount')}
          tokenSymbol={fromToken.assetSymbol}
          assetIcon={fromToken.networkAssetIcon}
          onClick={() => openTokenSelectModal('from')}
          onChange={handleInputChange}
          id="fromAmount"
        />
        <UserBalance token={fromToken} onClick={handleBalanceClick} />
      </>
    );
  }, [form, fromToken, handleInputChange, handleBalanceClick, openTokenSelectModal]);

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.fiat.assetIcon}
        tokenSymbol={toToken.fiat.symbol}
        onClick={() => openTokenSelectModal('to')}
        registerInput={form.register('toAmount')}
        disabled={tokenOutAmount?.isLoading}
        readOnly={true}
        id="toAmount"
      />
    ),
    [toToken, form, tokenOutAmount, openTokenSelectModal],
  );

  const onConfirm = useCallback(() => {
    if (validateTerms()) {
      return;
    }

    onSwapConfirm();
  }, [onSwapConfirm, validateTerms]);

  return (
    <>
      <FormProvider {...form}>
        <motion.form
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96"
          onSubmit={form.handleSubmit(onConfirm)}
        >
          <h1 className="mt-2 mb-5 text-3xl font-bold text-center text-blue-700">{t('components.swap.sellCrypto')}</h1>
          <LabeledInput
            label={t('components.swap.firstInputLabel')}
            htmlFor="fromAmount"
            Input={WithdrawNumericInput}
          />
          <div className="my-10" />
          <LabeledInput label={t('components.swap.secondInputLabel')} htmlFor="toAmount" Input={ReceiveNumericInput} />
          <RampFee />
          <section className="flex items-center justify-center w-full mt-5">
            <BenefitsList />
          </section>
          <BrlaSwapFields toToken={to} />
          <RampErrorMessage />
          <TermsSection />
          <div className="flex gap-3 mt-5">
            <button
              className="btn-vortex-primary-inverse btn"
              style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
              disabled={!inputAmountIsStable}
            >
              {t('components.swap.compareFees')}
            </button>
            <SwapSubmitButton disabled={!inputAmountIsStable} />
          </div>
          <div className="mb-16" />
          <PoweredBy />
        </motion.form>
      </FormProvider>
      <SigningBox />
      <PoolSelectorModal />
    </>
  );
};
