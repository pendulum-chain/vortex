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
    const shouldStartRamp =
      rampState?.userSigningMeta && !rampStarted && rampState?.ramp && (rampState?.signedTransactions?.length || 0) > 0;


    if (!shouldStartRamp) {
      return;
    }

    if (Boolean(rampState?.ramp?.type === 'on') && !rampPaymentConfirmed) {
      return;
    }

    RampService.startRamp(rampState!.ramp!.id, rampState.signedTransactions, rampState.userSigningMeta)
      .then((response) => {
        console.log('startRampResponse', response);
        setRampStarted(true);
      })
      .catch((err) => {
        console.error('Error starting ramp:', err);
      });
  }, [rampPaymentConfirmed, rampStarted, rampState, setRampStarted]);
};
