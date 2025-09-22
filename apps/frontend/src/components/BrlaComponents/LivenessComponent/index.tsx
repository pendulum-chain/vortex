import React from "react";
import { useAveniaKycActor, useAveniaKycSelector } from "../../../contexts/rampState";
import { AveniaKycActorRef, SelectedAveniaData } from "../../../machines/types";

interface AveniaLivenessProps {
  aveniaKycActor: AveniaKycActorRef;
  aveniaState: SelectedAveniaData;
}
export const LivenessComponent: React.FC<AveniaLivenessProps> = ({ aveniaState, aveniaKycActor }) => {
  const { livenessUrl } = aveniaState.context.documentUploadIds || {};

  const handleOpenLivenessUrl = () => {
    if (livenessUrl) {
      window.open(livenessUrl, "_blank");
    }
  };

  const handleLivenessDone = () => {
    aveniaKycActor.send({ type: "LIVENESS_DONE" });
  };

  return (
    <div>
      <button disabled={!livenessUrl} onClick={handleOpenLivenessUrl}>
        Open Liveness Check
      </button>
      <button onClick={handleLivenessDone}>Liveness Done</button>
    </div>
  );
};
