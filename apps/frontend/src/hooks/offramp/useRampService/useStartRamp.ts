import { useEffect } from "react";
import { RampService } from "../../../services/api";
import { useRampStore } from "../../../stores/rampStore";
import { useTrackRampConfirmation } from "../../useTrackRampConfirmation";

export const useStartRamp = () => {
  const {
    rampState,
    rampStarted,
    rampPaymentConfirmed,
    actions: { setRampStarted }
  } = useRampStore();

  const trackRampConfirmation = useTrackRampConfirmation();

  useEffect(() => {
    if (rampStarted || !rampState || !rampState.ramp || (rampState.signedTransactions.length || 0) === 0) {
      return;
    }

    // Check if user confirmed that they made the payment
    if (Boolean(rampState.ramp?.type === "on") && !rampPaymentConfirmed) {
      return;
    }

    if (rampState.ramp.type === "off") {
      // Check if the user signed the necessary transactions
      if (!rampState.userSigningMeta) {
        console.error("User signing meta is missing. Cannot start ramp.");
        return;
      }

      if (rampState.ramp.from === "assethub") {
        if (!rampState.userSigningMeta.assetHubToPendulumHash) {
          console.error("AssetHub to Pendulum hash is missing. Cannot start ramp.");
          return;
        }
      } else {
        // Here we assume we are in any EVM network and need squidrouter
        if (!rampState.userSigningMeta.squidRouterApproveHash || !rampState.userSigningMeta.squidRouterSwapHash) {
          console.error("Squid router hash is missing. Cannot start ramp.");
          return;
        }
      }
    }

    RampService.startRamp(rampState.ramp.id)
      .then(response => {
        console.log("startRampResponse", response);
        setRampStarted(true);
        trackRampConfirmation();
      })
      .catch(err => {
        console.error("Error starting ramp:", err);
        // TODO this can fail if the ramp 'expired'. We should handle this case and show a message to the user
      });
  }, [rampPaymentConfirmed, rampStarted, rampState, setRampStarted, trackRampConfirmation]);
};
