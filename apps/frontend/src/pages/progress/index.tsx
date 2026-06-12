import { CheckIcon, ExclamationCircleIcon } from "@heroicons/react/20/solid";
import { FiatToken, isNetworkEVM, RampDirection, RampPhase } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box } from "../../components/Box";
import { config } from "../../config";
import { useEventsContext } from "../../contexts/events";
import { useNetwork } from "../../contexts/network";
import { useRampActor } from "../../contexts/rampState";
import { GotQuestions } from "../../sections/individuals/GotQuestions";
import { RampService } from "../../services/api";
import { RampState } from "../../types/phases";
import { PHASE_DURATIONS, PHASE_FLOWS } from "./phaseFlows";
import { getMessageForPhase } from "./phaseMessages";

function getRampFlow(rampState: RampState | undefined): keyof typeof PHASE_FLOWS | null {
  if (!rampState || !rampState.ramp) {
    return null;
  }

  const { type } = rampState.ramp;

  if (type === RampDirection.BUY) {
    if (rampState.quote?.inputCurrency === FiatToken.BRL) {
      return "onramp_brl";
    }
    if (rampState.quote?.outputCurrency === "MORPHO VAULT") {
      return "onramp_eur_morpho";
    }
    return "onramp_eur_evm";
  }

  if (rampState.quote?.outputCurrency === FiatToken.BRL) {
    return "offramp_brl";
  }

  if (rampState.quote?.outputCurrency === FiatToken.EURC) {
    if (rampState.quote?.inputCurrency === "MORPHO VAULT") {
      return "offramp_eur_morpho";
    }
    return "offramp_eur_evm";
  }

  return null;
}

const useProgressUpdate = (
  currentPhase: RampPhase,
  currentPhaseIndex: number,
  numberOfPhases: number,
  displayedPercentage: number,
  setDisplayedPercentage: (value: (prev: number) => number) => void,
  setShowCheckmark: (value: boolean) => void
) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Capture start-of-phase percentage in a ref so the effect doesn't re-run (and clear the interval) every tick.
  const startPercentageRef = useRef(displayedPercentage);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const targetPercentage = Math.round((100 / numberOfPhases) * (currentPhaseIndex + 1));
    const duration = PHASE_DURATIONS[currentPhase] * 1000;
    const startTime = Date.now();
    const startPercentage = startPercentageRef.current;

    const calculateProgress = () => {
      const elapsedTime = Date.now() - startTime;
      const timeRatio = Math.min(1, elapsedTime / duration);

      return Math.min(100, Math.round(startPercentage + (targetPercentage - startPercentage) * timeRatio));
    };

    intervalRef.current = setInterval(() => {
      const newPercentage = calculateProgress();

      setDisplayedPercentage(() => {
        startPercentageRef.current = newPercentage;
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
  }, [currentPhase, currentPhaseIndex, numberOfPhases, setDisplayedPercentage, setShowCheckmark]);
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
          <stop offset="0%" stopColor="var(--color-progress-gradient-start)" />
          <stop offset="100%" stopColor="var(--color-progress-fill)" />
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
        stroke="var(--color-progress-track)"
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
          <CheckIcon className="h-12 w-12 text-primary" />
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
    <Box className="mt-4 flex flex-col items-center justify-center bg-white">
      <div className="flex max-w-[400px] flex-col items-center justify-center">
        {showIsDelayedWarning && <TransactionStatusBanner />}
        <p className="mb-4 text-center text-gray-600 text-lg">{t("pages.progress.closeProgressScreenText")}</p>
        <ProgressCircle circumference={circumference} displayedPercentage={displayedPercentage} showCheckmark={showCheckmark} />
        <motion.h1
          animate={{ opacity: 1, y: 0 }}
          className="my-3 font-bold text-base text-primary"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.6 }}
        >
          {t("pages.progress.transactionInProgress")}
        </motion.h1>
        <motion.h1
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 text-base text-primary"
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

  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));

  const rampId = rampState?.ramp?.id;
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
      return timeDiff > 20 * 60 * 1000; // 20 minutes
    }
    return false;
  }, [rampState?.ramp?.currentPhase, rampState?.ramp?.createdAt]);

  // Sync displayed phase to the active ramp. This also covers ramp-identity
  // changes (e.g. user starts a new ramp): a new ramp's phase resets to
  // "initial", so we won't briefly render the previous ramp's phase before
  // the next poll lands.
  useEffect(() => {
    const newPhase = rampState?.ramp?.currentPhase ?? "initial";
    if (newPhase === prevPhaseRef.current) return;
    const phaseIndex = phaseSequence.indexOf(newPhase);
    trackEvent({
      event: "progress",
      phase_index: phaseIndex >= 0 ? phaseIndex : 0,
      phase_name: newPhase
    });
    prevPhaseRef.current = newPhase;
    setCurrentPhase(newPhase);
  }, [rampState?.ramp?.currentPhase, phaseSequence, trackEvent]);

  useEffect(() => {
    if (!rampId || !flowType) return;

    let cancelled = false;

    //XSTATE: we could also move this into an internal process inside the FollowUp state.
    const fetchRampState = async () => {
      try {
        const updatedRampProcess = await RampService.getRampStatus(rampId);
        if (cancelled) return;

        // Defensive: the backend should echo the rampId we asked for, but if it
        // doesn't, drop the response rather than overwriting state.
        if (updatedRampProcess.id !== rampId) return;

        // Read the latest snapshot from the actor instead of relying on a
        // stale closure over `rampState`. If the active ramp has changed (or
        // been cleared) since this poll started, ignore this response - it
        // belongs to a stale ramp and would otherwise overwrite the new one.
        const latest = rampActor.getSnapshot().context.rampState;
        if (!latest || latest.ramp?.id !== rampId) return;

        rampActor.send({
          rampState: { ...latest, ramp: updatedRampProcess },
          type: "SET_RAMP_STATE"
        });
      } catch (error) {
        if (!cancelled) console.error("Failed to fetch ramp state:", error);
      }
    };

    fetchRampState();
    const intervalId = setInterval(fetchRampState, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [rampId, flowType, rampActor]);

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
