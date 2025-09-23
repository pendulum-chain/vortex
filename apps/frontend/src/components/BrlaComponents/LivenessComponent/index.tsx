import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../helpers/cn";
import { AveniaKycActorRef, SelectedAveniaData } from "../../../machines/types";

interface AveniaLivenessProps {
  aveniaKycActor: AveniaKycActorRef;
  aveniaState: SelectedAveniaData;
}
export const LivenessComponent: React.FC<AveniaLivenessProps> = ({ aveniaState, aveniaKycActor }) => {
  const { t } = useTranslation();
  const { livenessUrl } = aveniaState.context.documentUploadIds || {};
  const { livenessCheckOpened } = aveniaState.context;

  const handleOpenLivenessUrl = () => {
    if (livenessUrl) {
      window.open(livenessUrl, "_blank");
      aveniaKycActor.send({ type: "LIVENESS_OPENED" });
    }
  };

  const handleLivenessDone = () => {
    aveniaKycActor.send({ type: "LIVENESS_DONE" });
  };

  return (
    <div className="flex grow-1 flex-col">
      <div className="flex flex-grow items-center justify-center text-center">
        <p>{t("components.brlaLiveness.description")}</p>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4">
        {livenessCheckOpened ? (
          <button className={cn("btn-vortex-primary btn w-full rounded-xl")} onClick={handleLivenessDone}>
            {t("components.brlaLiveness.livenessDone")}
          </button>
        ) : (
          <button
            className={cn("btn-vortex-primary btn w-full rounded-xl")}
            disabled={!livenessUrl}
            onClick={handleOpenLivenessUrl}
          >
            {t("components.brlaLiveness.openLivenessCheck")}
          </button>
        )}
      </div>
    </div>
  );
};
