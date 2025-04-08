import { useCallback, useState } from 'react';
import { RampExecutionInput } from '../../types/phases';
import { useRampFormStore } from '../../stores/ramp/useRampFormStore';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';
import { useVortexAccount } from '../useVortexAccount';
import { useNetwork } from '../../contexts/network';
import { useRampActions } from '../../stores/offrampStore';
import { useEventsContext } from '../../contexts/events';
import {
  createMoonbeamEphemeral,
  createPendulumEphemeral,
  createStellarEphemeral,
} from '../../services/transactions/ephemerals';
import { useMainProcess } from '../offramp/useMainProcess';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../../components/RampToggle';
import { FiatToken } from 'shared';

interface SubmissionError extends Error {
  code?: string;
  message: string;
}

const createEphemerals = () => ({
  pendulumEphemeral: createPendulumEphemeral(),
  stellarEphemeral: createStellarEphemeral(),
  moonbeamEphemeral: createMoonbeamEphemeral(),
});

export const useRampSubmission = () => {
  const [executionPreparing, setExecutionPreparing] = useState(false);
  const { inputAmount, fiatToken, onChainToken, taxId, pixId } = useRampFormStore();
  const { quote } = useQuoteStore();
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const rampDirection = useRampDirection();
  const { setRampExecutionInput, setRampSummaryVisible, setRampInitiating } = useRampActions();
  const { handleOnSubmit, finishOfframping, continueFailedFlow, handleOnAnchorWindowOpen, handleBrlaOfframpStart } =
    useMainProcess();

  const validateSubmissionData = useCallback(() => {
    if (!address) {
      throw new Error('No wallet address found. Please connect your wallet.');
    }
    if (!quote) {
      throw new Error('No quote available. Please try again.');
    }
    if (!inputAmount) {
      throw new Error('No amount specified. Please enter an amount.');
    }
    if (fiatToken === 'brl') {
      if (!taxId) {
        throw new Error('Tax ID is required for BRL transactions.');
      }
    }
  }, [address, quote, inputAmount, fiatToken, taxId]);

  const prepareExecutionInput = useCallback(() => {
    validateSubmissionData();
    const ephemerals = createEphemerals();
    const executionInput: RampExecutionInput = {
      ephemerals,
      quote: quote,
      onChainToken,
      fiatToken,
      userWalletAddress: address,
      network: selectedNetwork,
      taxId,
      pixId,
      setInitializeFailed: (message) => {
        console.error('Initialization failed:', message);
      },
    };
    return executionInput;
  }, [validateSubmissionData, quote, onChainToken, fiatToken, address, selectedNetwork, taxId, pixId]);

  const trackTransaction = useCallback(() => {
    const fromAsset = rampDirection === RampDirection.ONRAMP ? fiatToken : onChainToken;
    const toAsset = rampDirection === RampDirection.ONRAMP ? onChainToken : fiatToken;
    trackEvent({
      event: 'transaction_confirmation',
      from_asset: fromAsset,
      to_asset: toAsset,
      from_amount: inputAmount?.toString() || '0',
      to_amount: quote?.outputAmount || '0',
    });
  }, [trackEvent, rampDirection, fiatToken, onChainToken, inputAmount, quote]);

  const handleSubmissionError = useCallback(
    (error: SubmissionError) => {
      console.error('Error preparing submission:', error);
      const errorMessage = error.message || 'An unknown error occurred';
      trackEvent({
        event: 'transaction_error',
        error_message: errorMessage,
        error_code: error.code || 'unknown',
      });
      setRampInitiating(false);
    },
    [trackEvent, setRampInitiating],
  );

  const onRampConfirm = useCallback(async () => {
    if (executionPreparing) return;
    setExecutionPreparing(true);
    try {
      const executionInput = prepareExecutionInput();
      setRampExecutionInput(executionInput);
      setRampSummaryVisible(true);
      handleOnSubmit(executionInput);
      trackTransaction();
    } catch (error) {
      handleSubmissionError(error as SubmissionError);
    } finally {
      setExecutionPreparing(false);
    }
  }, [
    executionPreparing,
    prepareExecutionInput,
    setRampExecutionInput,
    setRampSummaryVisible,
    handleOnSubmit,
    trackTransaction,
    handleSubmissionError,
  ]);

  const handleTransactionInitiation = useCallback(() => {
    if (!address) {
      throw new Error('No address found');
    }
    if (rampDirection === RampDirection.OFFRAMP) {
      if (fiatToken === ('brl' as FiatToken)) {
        handleBrlaOfframpStart();
      } else {
        handleOnAnchorWindowOpen();
      }
    } else {
      handleOnSubmit(prepareExecutionInput());
    }
  }, [
    address,
    rampDirection,
    fiatToken,
    handleBrlaOfframpStart,
    handleOnAnchorWindowOpen,
    handleOnSubmit,
    prepareExecutionInput,
  ]);

  return {
    onRampConfirm,
    handleTransactionInitiation,
    finishOfframping,
    continueFailedFlow,
    isExecutionPreparing: executionPreparing,
    validateSubmissionData,
  };
};
