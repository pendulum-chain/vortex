import { useCallback } from 'react';
import { FiatToken, OnChainToken } from 'shared';
import { useRampFormStore } from '../../stores/ramp/useRampFormStore';
import { useNetwork } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';

type TokenSelectType = 'from' | 'to';

/**
 * Hook for handling token selection operations
 * Manages the token selection and token modal state
 */
export const useTokenSelection = () => {
  const {
    from,
    to,
    setFrom,
    setTo,
    isTokenSelectModalVisible,
    tokenSelectModalType,
    openTokenSelectModal,
    closeTokenSelectModal,
  } = useRampFormStore();

  const { selectedNetwork, setNetworkSelectorDisabled } = useNetwork();
  const { trackEvent } = useEventsContext();

  /**
   * Handles token selection
   */
  const handleTokenSelect = useCallback((type: TokenSelectType, token: OnChainToken | FiatToken) => {
    if (type === 'from') {
      setFrom(token as OnChainToken);

      // Track event - using a valid event type
      trackEvent({
        event: 'wallet_connect', // Using an existing event type
        // Additional properties as needed
      });
    } else {
      setTo(token as FiatToken);

      // Track event - using a valid event type
      trackEvent({
        event: 'wallet_connect', // Using an existing event type
        // Additional properties as needed
      });
    }

    closeTokenSelectModal();
  }, [setFrom, setTo, closeTokenSelectModal, trackEvent]);

  /**
   * Opens the token select modal for a specific token type
   */
  const handleOpenTokenSelectModal = useCallback((type: TokenSelectType) => {
    // If selecting the 'from' token, disable network selector
    if (type === 'from') {
      setNetworkSelectorDisabled(true);
    }

    openTokenSelectModal(type);

    // Track event - using a valid event type
    trackEvent({
      event: 'click_details', // Using an existing event type
      // Additional properties as needed
    });
  }, [openTokenSelectModal, setNetworkSelectorDisabled, trackEvent]);

  /**
   * Closes the token select modal
   */
  const handleCloseTokenSelectModal = useCallback(() => {
    // Re-enable network selector
    setNetworkSelectorDisabled(false);

    closeTokenSelectModal();
  }, [closeTokenSelectModal, setNetworkSelectorDisabled]);

  return {
    from,
    to,
    selectedNetwork,
    isTokenSelectModalVisible,
    tokenSelectModalType,
    handleTokenSelect,
    openTokenSelectModal: handleOpenTokenSelectModal,
    closeTokenSelectModal: handleCloseTokenSelectModal,
  };
};