import React, { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
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
  const refreshClicked = useRef(false);

  useEffect(() => {
    if (livenessUrl && refreshClicked.current) {
      window.open(livenessUrl, "_blank");
      refreshClicked.current = false; // Reset the flag
    }
  }, [livenessUrl, refreshClicked.current]);

  const handleOpenLivenessUrl = () => {
    if (livenessUrl) {
      window.open(livenessUrl, "_blank");
      aveniaKycActor.send({ type: "LIVENESS_OPENED" });
    }
  };

  const handleLivenessDone = () => {
    aveniaKycActor.send({ type: "LIVENESS_DONE" });
  };

  const handleRefreshUrl = () => {
    refreshClicked.current = true;
    aveniaKycActor.send({ type: "REFRESH_LIVENESS_URL" });
  };

  return (
    <div className="flex grow-1 flex-col justify-center">
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
      {livenessCheckOpened && (
        <div className="text-center text-sm">
          <p>
            <Trans i18nKey="components.brlaLiveness.troubleText">
              Having trouble?{" "}
              <button className="text-vortex-primary underline" onClick={handleRefreshUrl}>
                Click here
              </button>{" "}
              to try again in a new session.
            </Trans>
          </p>
        </div>
      )}
    </div>
  );
};
