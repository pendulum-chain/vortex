import { CheckIcon, ExclamationCircleIcon } from "@heroicons/react/20/solid";
import { FiatToken, isNetworkEVM, Networks, RampDirection, RampPhase } from "@packages/shared";
import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box } from "../../components/Box";
import { config } from "../../config";
import { useEventsContext } from "../../contexts/events";
import { useNetwork } from "../../contexts/network";
import { useRampActor } from "../../contexts/rampState";
import { GotQuestions } from "../../sections";
import { RampService } from "../../services/api";
import { RampState } from "../../types/phases";
import { getMessageForPhase } from "./phaseMessages";

const PHASE_DURATIONS: Record<RampPhase, number> = {
  assethubToPendulum: 24,
  brlaOnrampMint: 5 * 60,
  brlaPayoutOnMoonbeam: 30,
  complete: 0,
  distributeFees: 24,
  failed: 0,
  fundEphemeral: 20,
  hydrationSwap: 30,
  hydrationToAssethubXcm: 30,
  initial: 0,
  moneriumOnrampMint: 60,
  moneriumOnrampSelfTransfer: 20,
  moonbeamToPendulum: 40,
  moonbeamToPendulumXcm: 30,
  nablaApprove: 24,
  nablaSwap: 24,
  pendulumToAssethubXcm: 30,
  pendulumToHydrationXcm: 30,
  pendulumToMoonbeam: 40,
  spacewalkRedeem: 130,
  squidRouterApprove: 10,
  squidRouterPay: 60,
  squidRouterSwap: 10,
  stellarCreateAccount: 0,
  stellarPayment: 6,
  subsidizePostSwap: 24,
  subsidizePreSwap: 24,
  timedOut: 0
};

export const PHASE_FLOWS = {
  assethub_offramp_through_stellar: [
    "initial",
    "fundEphemeral",
    "assethubToPendulum",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "subsidizePostSwap",
    "assethubToPendulum",
    "spacewalkRedeem",
    "stellarPayment",
    "distributeFees",
    "complete"
  ] as RampPhase[],

  evm_offramp_through_stellar: [
    "initial",
    "fundEphemeral",
    "moonbeamToPendulum",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "subsidizePostSwap",
    "assethubToPendulum",
    "spacewalkRedeem",
    "stellarPayment",
    "distributeFees",
    "complete"
  ] as RampPhase[],

  offramp_brl: [
    "initial",
    "fundEphemeral",
    "moonbeamToPendulum", // or "assethubToPendulum",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "subsidizePostSwap",
    "spacewalkRedeem",
    "stellarPayment",
    "brlaPayoutOnMoonbeam",
    "distributeFees",
    "complete"
  ] as RampPhase[],

  onramp_brl: [
    "initial",
    "brlaOnrampMint",
    "fundEphemeral",
    "moonbeamToPendulumXcm",
    "subsidizePreSwap",
    "nablaApprove",
    "nablaSwap",
    "subsidizePostSwap",
    "squidRouterApprove",
    "squidRouterPay",
    "squidRouterSwap",
    "distributeFees",
    "complete"
  ] as RampPhase[],

  onramp_eur: [
    "initial",
    "moneriumOnrampMint",
    "moneriumOnrampSelfTransfer",
    "squidRouterApprove",
    "squidRouterSwap",
    "distributeFees",
    "complete"
  ] as RampPhase[]
};

function getRampFlow(rampState: RampState | undefined): keyof typeof PHASE_FLOWS | null {
  if (!rampState || !rampState.ramp) {
    return null;
  }

  const { type, from } = rampState.ramp;
  const currentPhase = rampState.ramp.currentPhase;

  if (type === RampDirection.BUY) {
    if (
      currentPhase === "brlaOnrampMint" ||
      rampState.quote?.outputCurrency === FiatToken.BRL ||
      rampState.quote?.inputCurrency === FiatToken.BRL
    ) {
      return "onramp_brl";
    }

    if (
      currentPhase === "moneriumOnrampMint" ||
      currentPhase === "moneriumOnrampSelfTransfer" ||
      rampState.quote?.inputCurrency === FiatToken.EURC
    ) {
      return "onramp_eur";
    }

    return "onramp_eur";
  }

  if (currentPhase === "brlaPayoutOnMoonbeam" || rampState.quote?.outputCurrency === FiatToken.BRL) {
    return "offramp_brl";
  }

  if (from === Networks.AssetHub) {
    return "assethub_offramp_through_stellar";
  }

  return "evm_offramp_through_stellar";
}

const useProgressUpdate = (
  currentPhase: RampPhase,
  currentPhaseIndex: number,
  numberOfPhases: number,
  displayedPercentage: number,
  setDisplayedPercentage: (value: (prev: number) => number) => void,
  setShowCheckmark: (value: boolean) => void
) => {
  const intervalRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const targetPercentage = Math.round((100 / numberOfPhases) * (currentPhaseIndex + 1));
    const duration = PHASE_DURATIONS[currentPhase] * 1000;
    const startTime = Date.now();
    const startPercentage = displayedPercentage;

    const calculateProgress = () => {
      const elapsedTime = Date.now() - startTime;
      const timeRatio = Math.min(1, elapsedTime / duration);

      return Math.min(100, Math.round(startPercentage + (targetPercentage - startPercentage) * timeRatio));
    };

    intervalRef.current = setInterval(() => {
      const newPercentage = calculateProgress();

      setDisplayedPercentage(() => {
        if (newPercentage >= targetPercentage) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          if (currentPhaseIndex === numberOfPhases - 1) {
            setShowCheckmark(true);
          }
        }
        return newPercentage;
      });
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [currentPhase, currentPhaseIndex, displayedPercentage, numberOfPhases, setDisplayedPercentage, setShowCheckmark]);
};

const CIRCLE_RADIUS = 80;
const CIRCLE_STROKE_WIDTH = 12;

const ProgressCircle: FC<{
  displayedPercentage: number;
  showCheckmark: boolean;
  circumference: number;
}> = ({ displayedPercentage, showCheckmark, circumference }) => (
  <motion.div
    animate={{ opacity: 1, scale: 1 }}
    className="relative mt-12"
    initial={{ opacity: 0, scale: 0 }}
    transition={{ damping: 20, duration: 0.5, stiffness: 260, type: "spring" }}
  >
    <svg className="h-[200px] w-[200px]" viewBox="0 0 200 200">
      <defs>
        <linearGradient id="progressGradient" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <motion.circle
        animate={{ pathLength: 1 }}
        cx="100"
        cy="100"
        exit={{ pathLength: 0 }}
        fill="none"
        initial={{ pathLength: 0 }}
        r={CIRCLE_RADIUS}
        stroke="#E5E7EB"
        strokeWidth={CIRCLE_STROKE_WIDTH}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />
      <motion.circle
        cx="100"
        cy="100"
        fill="none"
        r={CIRCLE_RADIUS}
        stroke="url(#progressGradient)"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - (circumference * displayedPercentage) / 100}
        strokeWidth={CIRCLE_STROKE_WIDTH}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
        transform="rotate(-90 100 100)"
        transition={{ delay: 0.2, duration: 0.8, ease: "easeInOut" }}
      />
    </svg>
    <div className="absolute top-0 left-0 flex h-full w-full items-center justify-center">
      {showCheckmark ? (
        <motion.div animate={{ scale: 1 }} initial={{ scale: 0 }} transition={{ duration: 0.5, type: "spring" }}>
          <CheckIcon className="h-12 w-12 text-blue-700" />
        </motion.div>
      ) : (
        <motion.span animate={{ opacity: 1 }} className="text-4xl" initial={{ opacity: 0 }} transition={{ delay: 0.5 }}>
          {Math.round(displayedPercentage)}%
        </motion.span>
      )}
    </div>
  </motion.div>
);

interface ProgressContentProps {
  currentPhase: RampPhase;
  currentPhaseIndex: number;
  numberOfPhases: number;
  message: string;
  showIsDelayedWarning: boolean;
}

const TransactionStatusBanner: FC = () => {
  const { t } = useTranslation();

  const rampActor = useRampActor();
  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));

  return (
    <section className="flex items-center gap-4 rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
      <div className="flex-shrink-0 rounded-full bg-blue-100 p-2">
        <motion.div animate={{ opacity: [0.8, 1, 0.8] }} transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}>
          <ExclamationCircleIcon className="h-8 w-8 text-blue-600" />
        </motion.div>
      </div>
      <div className="flex-1">
        <h1 className="font-semibold text-gray-800 text-lg">{t("components.transactionStatusBanner.title")}</h1>
        <p className="mt-1 text-gray-700 text-sm">
          {t("components.transactionStatusBanner.beforeUrl")}
          <a
            className="mx-1 font-medium text-blue-600 transition-colors hover:text-blue-800"
            href={config.supportUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t("components.transactionStatusBanner.url")}
          </a>
          {t("components.transactionStatusBanner.afterUrl")}
        </p>
        <div className="mt-2 flex flex-row items-center text-gray-700 text-sm">
          <span className="mr-2 whitespace-nowrap">{t("components.transactionStatusBanner.transactionId")}</span>
          <span className="overflow-x-auto rounded border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-gray-800">
            {rampState?.ramp?.id || "N/A"}
          </span>
        </div>
      </div>
    </section>
  );
};

const ProgressContent: FC<ProgressContentProps> = ({
  currentPhase,
  currentPhaseIndex,
  numberOfPhases,
  message,
  showIsDelayedWarning
}) => {
  const { t } = useTranslation();

  const { selectedNetwork } = useNetwork();
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [displayedPercentage, setDisplayedPercentage] = useState(0);
  const circumference = CIRCLE_RADIUS * 2 * Math.PI;

  useProgressUpdate(
    currentPhase,
    currentPhaseIndex,
    numberOfPhases,
    displayedPercentage,
    setDisplayedPercentage,
    setShowCheckmark
  );

  return (
    <Box className="mt-4 flex flex-col items-center justify-center">
      <div className="flex max-w-[400px] flex-col items-center justify-center">
        {showIsDelayedWarning && <TransactionStatusBanner />}
        <p className="mb-4 text-gray-600 text-lg">{t("pages.progress.closeProgressScreenText")}</p>
        <ProgressCircle circumference={circumference} displayedPercentage={displayedPercentage} showCheckmark={showCheckmark} />
        <motion.h1
          animate={{ opacity: 1, y: 0 }}
          className="my-3 font-bold text-base text-blue-700"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.6 }}
        >
          {t("pages.progress.transactionInProgress")}
        </motion.h1>
        <motion.h1
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 text-base text-blue-700"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.8 }}
        >
          {!isNetworkEVM(selectedNetwork) ? t("pages.progress.estimatedTimeAssetHub") : t("pages.progress.estimatedTimeEVM")}
        </motion.h1>
        <motion.p animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} transition={{ delay: 1 }}>
          {message}
        </motion.p>
      </div>
    </Box>
  );
};

export const ProgressPage = () => {
  const { t } = useTranslation();
  const { trackEvent } = useEventsContext();
  const rampActor = useRampActor();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));

  const prevPhaseRef = useRef<RampPhase>(rampState?.ramp?.currentPhase || "initial");
  const [currentPhase, setCurrentPhase] = useState<RampPhase>(prevPhaseRef.current);

  const flowType = getRampFlow(rampState);

  const phaseSequence = flowType ? PHASE_FLOWS[flowType] : [];
  const numberOfPhases = phaseSequence.length || 1;
  const currentPhaseIndex = flowType ? phaseSequence.indexOf(currentPhase) : 0;
  const message = flowType ? getMessageForPhase(rampState, t) : "";

  const showIsDelayedWarning = useMemo(() => {
    if (rampState?.ramp?.createdAt && rampState?.ramp?.currentPhase !== "complete") {
      const createdAt = new Date(rampState.ramp.createdAt);
      const currentTime = new Date();
      const timeDiff = Math.abs(currentTime.getTime() - createdAt.getTime());
      return timeDiff > 10 * 60 * 1000; // 10 minutes
    }
    return false;
  }, [rampState?.ramp?.currentPhase, rampState?.ramp?.createdAt]);

  useEffect(() => {
    if (!rampState?.ramp?.id || !flowType || intervalRef.current) return;

    const rampId = rampState.ramp.id;

    //XSTATE: we could also move this into an internal process inside the FollowUp state.
    const fetchRampState = async () => {
      try {
        const updatedRampProcess = await RampService.getRampStatus(rampId);

        const currentRampState = rampState;
        if (currentRampState) {
          const updatedRampState = {
            ...currentRampState,
            ramp: updatedRampProcess
          };
          rampActor.send({ rampState: updatedRampState, type: "SET_RAMP_STATE" });
        }

        const maybeNewPhase = updatedRampProcess.currentPhase;
        if (maybeNewPhase !== prevPhaseRef.current) {
          const phaseIndex = phaseSequence.indexOf(maybeNewPhase);
          trackEvent({
            event: "progress",
            phase_index: phaseIndex >= 0 ? phaseIndex : 0,
            phase_name: maybeNewPhase
          });

          prevPhaseRef.current = maybeNewPhase;
          setCurrentPhase(maybeNewPhase);
        }
      } catch (error) {
        console.error("Failed to fetch ramp state:", error);
      }
    };

    fetchRampState();
    const intervalId = setInterval(fetchRampState, 5000);
    intervalRef.current = intervalId;
  }, [rampState?.ramp?.id, phaseSequence, rampState, trackEvent, flowType, rampActor.send]);

  return (
    <main>
      <ProgressContent
        currentPhase={currentPhase}
        currentPhaseIndex={currentPhaseIndex}
        message={message}
        numberOfPhases={numberOfPhases}
        showIsDelayedWarning={showIsDelayedWarning}
      />
      <GotQuestions />
    </main>
  );
};
