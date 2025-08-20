import { motion } from "motion/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { ActorRefFrom } from "xstate";
import { AveniaKycActorRef, SelectedAveniaData } from "../../../machines/types";
import { KycStatus } from "../../../services/signingService";
import { Spinner } from "../../Spinner";

interface VerificationStatusProps {
  aveniaKycActor: AveniaKycActorRef;
  aveniaState: SelectedAveniaData;
}

export const VerificationStatus: React.FC<VerificationStatusProps> = ({ aveniaKycActor, aveniaState }) => {
  const { t } = useTranslation();

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="mx-4 mt-8 mb-4 flex min-h-[480px] flex-col items-center justify-center rounded-lg px-4 py-4 shadow-custom md:mx-auto md:w-96"
      initial={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      {aveniaState.stateValue === "Failure" ? (
        <>
          <ErrorIcon />
          <motion.p
            animate={{ opacity: 1 }}
            className="mt-4 text-center font-bold text-lg"
            initial={{ opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {t("components.brlaExtendedForm.messageDisplay.networkError")}
          </motion.p>
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="btn-vortex-primary btn mt-6 px-8"
            initial={{ opacity: 0, y: 20 }}
            onClick={() => aveniaKycActor.send({ type: "CANCEL_RETRY" })} // TODO do we really want this action?
            transition={{ delay: 0.6, duration: 0.3 }}
          >
            {t("components.brlaExtendedForm.buttons.back")}
          </motion.button>
        </>
      ) : (
        <>
          {aveniaState.context.kycStatus === KycStatus.PENDING && <Spinner size="lg" theme="dark" />}

          {aveniaState.context.kycStatus === KycStatus.APPROVED && <SuccessIcon />}

          {aveniaState.context.kycStatus === KycStatus.REJECTED && <ErrorIcon />}

          <motion.p
            animate={{ opacity: 1 }}
            className="mt-4 text-center font-bold text-lg"
            initial={{ opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {undefined}
          </motion.p>

          {aveniaState.context.kycStatus === KycStatus.REJECTED && aveniaState.context.rejectReason && (
            <motion.p
              animate={{ opacity: 1 }}
              className="mt-2 px-4 text-center text-red-600 text-sm"
              initial={{ opacity: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              {aveniaState.context.rejectReason}
            </motion.p>
          )}

          {aveniaState.context.kycStatus === KycStatus.APPROVED && (
            <motion.button
              animate={{ opacity: 1, y: 0 }}
              className="btn-vortex-primary btn mt-6 px-8"
              initial={{ opacity: 0, y: 20 }}
              onClick={() => aveniaKycActor.send({ type: "CLOSE_SUCCESS_MODAL" })}
              transition={{ delay: 0.6, duration: 0.3 }}
            >
              {t("components.brlaExtendedForm.buttons.continue")}
            </motion.button>
          )}

          {aveniaState.context.kycStatus === KycStatus.REJECTED && (
            <motion.button
              animate={{ opacity: 1, y: 0 }}
              className="btn-vortex-primary btn mt-6 px-8"
              initial={{ opacity: 0, y: 20 }}
              onClick={() => aveniaKycActor.send({ type: "RETRY" })}
              transition={{ delay: 0.6, duration: 0.3 }}
            >
              {t("components.brlaExtendedForm.buttons.tryAgain")}
            </motion.button>
          )}
        </>
      )}
    </motion.div>
  );
};

const SuccessIcon = () => (
  <motion.svg
    animate={{ scale: 1 }}
    className="h-16 w-16 text-green-500"
    fill="none"
    initial={{ scale: 0 }}
    stroke="currentColor"
    transition={{
      damping: 15,
      stiffness: 200,
      type: "spring"
    }}
    viewBox="0 0 24 24"
  >
    <motion.path
      animate={{ pathLength: 1 }}
      d="M5 13l4 4L19 7"
      initial={{ pathLength: 0 }}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      transition={{ delay: 0.2, duration: 0.8 }}
    />
  </motion.svg>
);

const ErrorIcon = () => (
  <motion.svg
    animate={{ opacity: 1, rotate: 0 }}
    className="h-16 w-16 text-red-500"
    fill="none"
    initial={{ opacity: 0, rotate: -90 }}
    stroke="currentColor"
    transition={{ duration: 0.5 }}
    viewBox="0 0 24 24"
  >
    <motion.path
      animate={{ pathLength: 1 }}
      d="M6 18L18 6M6 6l12 12"
      initial={{ pathLength: 0 }}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      transition={{ duration: 0.6 }}
    />
  </motion.svg>
);
