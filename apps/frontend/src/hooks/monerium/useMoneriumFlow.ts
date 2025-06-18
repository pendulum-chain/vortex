import { useCallback, useEffect } from 'react';
import { exchangeMoneriumCode } from '../../services/monerium/moneriumAuth';
import { useMoneriumStore } from '../../stores/moneriumStore';

/**
 * Hook to manage Monerium authentication flow state and handle redirects
 */
export const useMoneriumFlow = () => {
  const { triggered, flowState, codeVerifier, authToken, setFlowState, reset } = useMoneriumStore();

  // Handle redirect from Monerium
  useEffect(() => {
    // only listen if a Monerium ramp has been triggered, and the flow state is redirecting or in siwe mode.
    if (!triggered || flowState === 'completed' || flowState === 'idle' || flowState === 'authenticating') {
      return;
    }

    const handleRedirect = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code && codeVerifier) {
        try {
          // Exchange the code for tokens
          await exchangeMoneriumCode(code);

          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error('Error exchanging Monerium code:', error);
          // TODO clean reset of everything ramp wise. not just flow state.
          resetFlow();
        }
      }
    };

    handleRedirect();
  }, [triggered, codeVerifier, flowState, setFlowState]);

  // Reset function for cleanup
  const resetFlow = useCallback(() => {
    reset();
  }, [reset]);

  return {
    flowState,
    authToken,
    isAuthenticated: flowState === 'completed' && !!authToken,
    resetFlow,
  };
};
