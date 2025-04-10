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
import { useRegisterBRLRamp } from '../offramp/useRampService/brl/useRegisterBRLRamp';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { RampDirection } from '../../components/RampToggle';
import { FiatToken } from 'shared';
import { useMainProcess } from '../offramp/useMainProcess';

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
  const { registerBRLOnramp } = useRegisterBRLRamp();
  const { handleOnSubmit } = useMainProcess();

  // @TODO: implement Error boundary
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
    if (!quote) {
      throw new Error('No quote available. Please try again.');
    }
    if (!address) {
      throw new Error('No address found. Please connect your wallet.');
    }

    const ephemerals = createEphemerals();
    const executionInput: RampExecutionInput = {
      ephemerals,
      quote,
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
      trackEvent({
        event: 'transaction_failure',
        error_message: error.code || 'unknown',
        phase_index: 0,
        from_asset: fiatToken,
        to_asset: onChainToken,
        from_amount: inputAmount?.toString() || '0',
        to_amount: quote?.outputAmount || '0',
      });
      setRampInitiating(false);
    },
    [trackEvent, fiatToken, onChainToken, inputAmount, quote?.outputAmount, setRampInitiating],
  );

  const onRampConfirm = useCallback(async () => {
    if (executionPreparing) return;
    setExecutionPreparing(true);
    try {
      const executionInput = prepareExecutionInput();
      setRampExecutionInput(executionInput);
      setRampSummaryVisible(true);

      if (rampDirection === RampDirection.ONRAMP) {
        registerBRLOnramp(executionInput);
      } else {
        handleOnSubmit(executionInput);
      }
      trackTransaction();
    } catch (error) {
      handleSubmissionError(error as SubmissionError);
    } finally {
      setExecutionPreparing(false);
    }
  }, [executionPreparing, prepareExecutionInput, setRampExecutionInput, setRampSummaryVisible, rampDirection, trackTransaction, registerBRLOnramp, handleOnSubmit, handleSubmissionError]);

  const handleTransactionInitiation = useCallback(() => {
    if (!address) {
      throw new Error('No address found');
    }
    if (rampDirection === RampDirection.ONRAMP) {
      if (fiatToken === FiatToken.BRL) {
        // registerBRLOnramp();
      } else {
        // handleOnAnchorWindowOpen();
      }
    } else {
      // handleOnSubmit(prepareExecutionInput());
    }
  }, [address, rampDirection, fiatToken, registerBRLOnramp]);

  return {
    onRampConfirm,
    handleTransactionInitiation,
    isExecutionPreparing: executionPreparing,
    finishOfframping: () => {
      // TODO cleanup offramping state and allow starting a new one
    },
    validateSubmissionData,
  };
};
