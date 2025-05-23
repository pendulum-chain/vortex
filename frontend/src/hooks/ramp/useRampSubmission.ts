import { useCallback, useState } from 'react';
import { RampExecutionInput } from '../../types/phases';
import { useRampFormStore } from '../../stores/ramp/useRampFormStore';
import { useQuoteStore } from '../../stores/ramp/useQuoteStore';
import { useVortexAccount } from '../useVortexAccount';
import { useNetwork } from '../../contexts/network';
import { useRampActions } from '../../stores/rampStore';
import { useEventsContext } from '../../contexts/events';
import {
  createMoonbeamEphemeral,
  createPendulumEphemeral,
  createStellarEphemeral,
} from '../../services/transactions/ephemerals';
import { useRegisterRamp } from '../offramp/useRampService/useRegisterRamp';
import { useStartRamp } from '../offramp/useRampService/useStartRamp';
import { usePreRampCheck } from '../../services/initialChecks';

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
  const { setRampExecutionInput, setRampInitiating, resetRampState } = useRampActions();
  const { registerRamp } = useRegisterRamp();
  const preRampCheck = usePreRampCheck();
  useStartRamp(); // This will automatically start the ramp process when the conditions are met

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
      await preRampCheck(executionInput);
      setRampExecutionInput(executionInput);
      await registerRamp(executionInput);
    } catch (error) {
      handleSubmissionError(error as SubmissionError);
    } finally {
      setExecutionPreparing(false);
    }
  }, [
    executionPreparing,
    prepareExecutionInput,
    preRampCheck,
    setRampExecutionInput,
    registerRamp,
    handleSubmissionError,
  ]);

  return {
    onRampConfirm,
    isExecutionPreparing: executionPreparing,
    finishOfframping: () => {
      resetRampState();
    },
    validateSubmissionData,
  };
};
