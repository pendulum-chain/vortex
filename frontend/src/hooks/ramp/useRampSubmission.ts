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
  createStellarEphemeral
} from '../../services/transactions/ephemerals';
import { useMainProcess } from '../offramp/useMainProcess';

/**
 * Hook for handling ramp submission logic
 * Encapsulates the process of preparing and submitting ramp transactions
 */
export const useRampSubmission = () => {
  const [executionPreparing, setExecutionPreparing] = useState(false);

  // Get state from stores
  const { fromAmount, from, to, taxId, pixId } = useRampFormStore();
  const { quote } = useQuoteStore();
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();

  // Get store actions
  const {
    setRampExecutionInput,
    setRampSummaryVisible,
    setRampInitiating
  } = useRampActions();

  // Get main process functions
  const {
    handleOnSubmit,
    finishOfframping,
    continueFailedFlow,
    handleOnAnchorWindowOpen,
    handleBrlaOfframpStart,
  } = useMainProcess();

  /**
   * Prepares the execution input for submission
   */
  const prepareExecutionInput = useCallback(() => {
    if (!address) {
      throw new Error('No address found');
    }

    if (!quote) {
      throw new Error('No quote available');
    }

    if (!fromAmount) {
      throw new Error('No amount specified');
    }

    // Create ephemeral accounts for the transaction
    const pendulumEphemeral = createPendulumEphemeral();
    const stellarEphemeral = createStellarEphemeral();
    const moonbeamEphemeral = createMoonbeamEphemeral();

    const executionInput: RampExecutionInput = {
      ephemerals: {
        pendulumEphemeral,
        stellarEphemeral,
        moonbeamEphemeral,
      },
      quote,
      onChainToken: from,
      fiatToken: to,
      userWalletAddress: address,
      network: selectedNetwork,
      taxId,
      pixId,
      setInitializeFailed: (message) => {
        console.error('Initialization failed:', message);
      },
    };

    return executionInput;
  }, [address, quote, fromAmount, from, to, selectedNetwork, taxId, pixId]);

  /**
   * Handles the swap confirmation process
   */
  const onSwapConfirm = useCallback(async () => {
    if (executionPreparing) return;

    setExecutionPreparing(true);

    try {
      const executionInput = prepareExecutionInput();

      // Store execution input in global state
      setRampExecutionInput(executionInput);

      // Show summary dialog
      setRampSummaryVisible(true);

      // Handle submission
      handleOnSubmit(executionInput);

      // Track event
      trackEvent({
        event: 'transaction_confirmation',
        from_asset: from,
        to_asset: to,
        from_amount: fromAmount?.toString() || '0',
        to_amount: quote?.outputAmount || '0',
      });
    } catch (error) {
      console.error('Error preparing swap:', error);
      setRampInitiating(false);
    } finally {
      setExecutionPreparing(false);
    }
  }, [
    executionPreparing,
    prepareExecutionInput,
    setRampExecutionInput,
    setRampSummaryVisible,
    handleOnSubmit,
    trackEvent,
    from,
    to,
    fromAmount,
    quote,
    setRampInitiating
  ]);

  /**
   * Handles the offramp submission after the summary is confirmed
   */
  const handleOfframpSubmit = useCallback(() => {
    if (!address) {
      throw new Error('No address found');
    }

    // Different handling based on token
    to === 'brl' ? handleBrlaOfframpStart() : handleOnAnchorWindowOpen();
  }, [address, to, handleBrlaOfframpStart, handleOnAnchorWindowOpen]);

  return {
    onSwapConfirm,
    handleOfframpSubmit,
    finishOfframping,
    continueFailedFlow,
    isExecutionPreparing: executionPreparing
  };
};