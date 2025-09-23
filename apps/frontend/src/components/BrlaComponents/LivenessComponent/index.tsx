import { motion } from "motion/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { AveniaKycActorRef, SelectedAveniaData } from "../../../machines/types";

interface AveniaLivenessProps {
  aveniaKycActor: AveniaKycActorRef;
  aveniaState: SelectedAveniaData;
}
export const LivenessComponent: React.FC<AveniaLivenessProps> = ({ aveniaState, aveniaKycActor }) => {
  const { t } = useTranslation();
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
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="mx-4 mt-8 mb-4 flex min-h-[480px] flex-col items-center justify-center px-4 py-4 md:mx-auto"
      initial={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      <motion.p
        animate={{ opacity: 1 }}
        className="text-center font-bold text-lg"
        initial={{ opacity: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        {t("components.brlaLiveness.description")}
      </motion.p>

      <div className="mt-auto flex w-full gap-x-4 pt-4">
        <motion.button
          animate={{ opacity: 1, y: 0 }}
          className="btn flex-1 bg-blue-500 px-8 text-white hover:bg-blue-600"
          disabled={!livenessUrl}
          initial={{ opacity: 0, y: 20 }}
          onClick={handleOpenLivenessUrl}
          transition={{ delay: 0.6, duration: 0.3 }}
        >
          {t("components.brlaLiveness.openLivenessCheck")}
        </motion.button>
        <motion.button
          animate={{ opacity: 1, y: 0 }}
          className="btn-vortex-primary btn flex-1 px-8"
          initial={{ opacity: 0, y: 20 }}
          onClick={handleLivenessDone}
          transition={{ delay: 0.6, duration: 0.3 }}
        >
          {t("components.brlaLiveness.livenessDone")}
        </motion.button>
      </div>
    </motion.div>
  );
};
