import { useEffect } from 'react';
import { useRampStore } from '../../../stores/offrampStore';
import { RampService } from '../../../services/api';

export const useStartRamp = () => {
  const {
    rampState,
    rampStarted,
    rampPaymentConfirmed,
    actions: { setRampStarted },
  } = useRampStore();

  useEffect(() => {
    if (rampStarted || !rampState || !rampState.ramp || (rampState.signedTransactions.length || 0) === 0) {
      return;
    }

    // Check if user confirmed that they made the payment
    if (Boolean(rampState.ramp?.type === 'on') && !rampPaymentConfirmed) {
      return;
    }

    if (rampState.ramp.type === 'off') {
      // Check if the user signed the necessary transactions
      if (!rampState.userSigningMeta) {
        console.error('User signing meta is missing. Cannot start ramp.');
        return;
      }

      if (rampState.ramp.from === 'assethub') {
        if (!rampState.userSigningMeta.assetHubToPendulumHash) {
          console.error('AssetHub to Pendulum hash is missing. Cannot start ramp.');
          return;
        }
      } else {
        // Here we assume we are in any EVM network and need squidrouter
        if (!rampState.userSigningMeta.squidRouterApproveHash || !rampState.userSigningMeta.squidRouterSwapHash) {
          console.error('Squid router hash is missing. Cannot start ramp.');
          return;
        }
      }
    }

    RampService.startRamp(rampState.ramp.id, rampState.signedTransactions, rampState.userSigningMeta)
      .then((response) => {
        console.log('startRampResponse', response);
        setRampStarted(true);
      })
      .catch((err) => {
        console.error('Error starting ramp:', err);
      });
  }, [rampPaymentConfirmed, rampStarted, rampState, setRampStarted]);
};
