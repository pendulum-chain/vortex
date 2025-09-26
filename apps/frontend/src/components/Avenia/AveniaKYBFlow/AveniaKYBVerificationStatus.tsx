import { motion } from "motion/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { useAveniaKycActor, useAveniaKycSelector } from "../../../contexts/rampState";
import { KycStatus } from "../../../services/signingService";
import { Spinner } from "../../Spinner";

export const AveniaKYBVerificationStatus: React.FC = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();
  const { t } = useTranslation();

  if (!aveniaState || !aveniaKycActor) return null;

  console.log(aveniaState.context.kycStatus);
  return (
    <>
      <div className="relative">
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="mx-4 mt-8 mb-4 flex min-h-[480px] flex-col items-center justify-center px-4 py-4 md:mx-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3 }}
        >
          {aveniaState.context.kycStatus === KycStatus.PENDING && (
            <>
              <Spinner size="lg" theme="dark" />
              <motion.p
                animate={{ opacity: 1 }}
                className="mt-4 text-center font-bold text-lg"
                initial={{ opacity: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                {t("components.aveniaKYB.verification.pending")}
              </motion.p>
            </>
          )}

          {aveniaState.context.kycStatus === KycStatus.APPROVED && (
            <>
              <SuccessIcon />
              <motion.p
                animate={{ opacity: 1 }}
                className="mt-4 text-center font-bold text-lg"
                initial={{ opacity: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                {t("components.aveniaKYB.verification.approved")}
              </motion.p>
              <motion.button
                animate={{ opacity: 1, y: 0 }}
                className="btn-vortex-primary btn mt-6 px-8"
                initial={{ opacity: 0, y: 20 }}
                onClick={() => aveniaKycActor.send({ type: "CLOSE_SUCCESS_MODAL" })}
                transition={{ delay: 0.6, duration: 0.3 }}
              >
                {t("components.aveniaKYB.buttons.continue")}
              </motion.button>
            </>
          )}

          {aveniaState.context.kycStatus === KycStatus.REJECTED && (
            <>
              <ErrorIcon />
              <motion.p
                animate={{ opacity: 1 }}
                className="mt-4 text-center font-bold text-lg"
                initial={{ opacity: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                {t("components.aveniaKYB.verification.rejected")}
              </motion.p>
              {aveniaState.context.rejectReason && (
                <motion.p
                  animate={{ opacity: 1 }}
                  className="mt-2 px-4 text-center text-red-600 text-sm"
                  initial={{ opacity: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                >
                  {aveniaState.context.rejectReason}
                </motion.p>
              )}
              <div className="mt-6 flex w-full gap-x-4">
                <motion.button
                  animate={{ opacity: 1, y: 0 }}
                  className="btn flex-1 bg-pink-500 px-8 text-white hover:bg-pink-600"
                  initial={{ opacity: 0, y: 20 }}
                  onClick={() => aveniaKycActor.send({ type: "CANCEL_RETRY" })}
                  transition={{ delay: 0.6, duration: 0.3 }}
                >
                  {t("components.aveniaKYB.buttons.back")}
                </motion.button>
                <motion.button
                  animate={{ opacity: 1, y: 0 }}
                  className="btn-vortex-primary btn flex-1 px-8"
                  initial={{ opacity: 0, y: 20 }}
                  onClick={() => aveniaKycActor.send({ type: "RETRY" })}
                  transition={{ delay: 0.6, duration: 0.3 }}
                >
                  {t("components.aveniaKYB.buttons.tryAgain")}
                </motion.button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </>
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
