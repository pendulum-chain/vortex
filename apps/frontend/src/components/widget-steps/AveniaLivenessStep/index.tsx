import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { motion } from "motion/react";
import React, { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import livenessCheck from "../../../assets/liveness-check.svg";
import { AveniaKycActorRef, SelectedAveniaData } from "../../../machines/types";

interface AveniaLivenessStepProps {
  aveniaKycActor: AveniaKycActorRef;
  aveniaState: SelectedAveniaData;
}
export const AveniaLivenessStep: React.FC<AveniaLivenessStepProps> = ({ aveniaState, aveniaKycActor }) => {
  const { t } = useTranslation();
  const { livenessUrl } = aveniaState.context.documentUploadIds || {};
  const { livenessCheckOpened } = aveniaState.context;
  const refreshClicked = useRef(false);

  const handleOpenLivenessUrl = () => {
    if (livenessUrl) {
      window.open(livenessUrl, "_blank");
      aveniaKycActor.send({ type: "LIVENESS_OPENED" });
    }
  };

  useEffect(() => {
    if (livenessUrl && refreshClicked.current) {
      window.open(livenessUrl, "_blank");
      refreshClicked.current = false;
    }
  }, [livenessUrl]);

  const handleLivenessDone = () => {
    aveniaKycActor.send({ type: "LIVENESS_DONE" });
  };

  const handleRefreshUrl = () => {
    refreshClicked.current = true;
    aveniaKycActor.send({ type: "REFRESH_LIVENESS_URL" });
  };

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="mx-4 mt-8 mb-4 flex min-h-[480px] flex-col items-center justify-center px-4 py-4 md:mx-auto"
      initial={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center">
        <h1 className="mb-4 font-bold text-3xl text-blue-700">{t("components.aveniaLiveness.title")}</h1>
        <motion.p
          animate={{ opacity: 1 }}
          className="text-gray-600 text-sm"
          initial={{ opacity: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {t("components.aveniaLiveness.description")}
        </motion.p>
      </div>

      <div className="alert alert-warning my-4" role="alert">
        <svg className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
          />
        </svg>
        <span>{t("components.aveniaLiveness.cameraWarning")}</span>
      </div>

      <img alt="Liveness Check" className="mx-auto mb-8 w-1/2 " src={livenessCheck} />

      <div className="mt-auto flex w-full gap-x-4 pt-4">
        {livenessCheckOpened ? (
          <div className="justify-center">
            <motion.button
              animate={{ opacity: 1, y: 0 }}
              className="btn-vortex-primary btn flex-1 px-8"
              initial={{ opacity: 0, y: 20 }}
              onClick={handleLivenessDone}
              transition={{ delay: 0.6, duration: 0.3 }}
            >
              {t("components.aveniaLiveness.livenessDone")}
            </motion.button>

            <div className="text-center text-sm ">
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
          </div>
        ) : (
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="btn-vortex-primary btn flex-1 px-8"
            disabled={!livenessUrl}
            initial={{ opacity: 0, y: 20 }}
            onClick={handleOpenLivenessUrl}
            transition={{ delay: 0.6, duration: 0.3 }}
          >
            {t("components.aveniaLiveness.openLivenessCheck")}
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
};
