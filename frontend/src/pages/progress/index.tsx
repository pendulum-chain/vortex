import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckIcon, ExclamationCircleIcon } from '@heroicons/react/20/solid';
import { useTranslation } from 'react-i18next';

import { Box } from '../../components/Box';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { isNetworkEVM, RampPhase } from 'shared';
import { GotQuestions } from '../../sections';
import { useRampActions, useRampState, useRampStore } from '../../stores/offrampStore';
import { RampService } from '../../services/api';
import { getMessageForPhase } from './phaseMessages';
import { config } from '../../config';

const useProgressUpdate = (
  currentPhase: RampPhase,
  currentPhaseIndex: number,
  rampPhaseRecords: Record<RampPhase, number>,
  displayedPercentage: number,
  setDisplayedPercentage: (value: (prev: number) => number) => void,
  setShowCheckmark: (value: boolean) => void,
) => {
  const phaseStartTime = useRef(Date.now());
  const phaseStartPercentage = useRef(displayedPercentage);
  const numberOfPhases = Object.keys(rampPhaseRecords).length;

  useEffect(() => {
    const targetPercentage = Math.round((100 / numberOfPhases) * (currentPhaseIndex + 1));
    const duration = rampPhaseRecords[currentPhase] * 1000;

    phaseStartTime.current = Date.now();
    phaseStartPercentage.current = displayedPercentage;

    const progressUpdateInterval = setInterval(() => {
      const elapsedTime = Date.now() - phaseStartTime.current;
      const timeRatio = Math.min(1, elapsedTime / duration);

      const newPercentage = Math.round(
        phaseStartPercentage.current + (targetPercentage - phaseStartPercentage.current) * timeRatio,
      );

      setDisplayedPercentage(() => {
        if (timeRatio === 1) {
          clearInterval(progressUpdateInterval);
          if (currentPhaseIndex === numberOfPhases - 1) {
            setShowCheckmark(true);
          }
        }
        return newPercentage;
      });
    }, 100);

    return () => clearInterval(progressUpdateInterval);
  }, [
    currentPhase,
    currentPhaseIndex,
    displayedPercentage,
    numberOfPhases,
    rampPhaseRecords,
    setDisplayedPercentage,
    setShowCheckmark,
  ]);
};

// The order of the phases is important for the progress bar.
export const ONRAMPING_PHASE_SECONDS: Record<RampPhase, number> = {
  initial: 0,
  fundEphemeral: 20,
  brlaTeleport: 30,
  moonbeamToPendulumXcm: 30,
  subsidizePreSwap: 24,
  nablaApprove: 24,
  nablaSwap: 24,
  subsidizePostSwap: 24,
  pendulumToMoonbeam: 40,
  pendulumToAssethub: 30,
  squidrouterApprove: 10,
  squidrouterSwap: 10,

  complete: 0,
  timedOut: 0,
  failed: 0,

  // The following are unused phases in the onramping process but are included for completeness.
  moonbeamToPendulum: 40,
  assethubToPendulum: 24,
  spacewalkRedeem: 130,
  stellarPayment: 6,
  brlaPayoutOnMoonbeam: 120,
  stellarCreateAccount: 10,
};

// The order of the phases is important for the progress bar.
export const OFFRAMPING_PHASE_SECONDS: Record<RampPhase, number> = {
  initial: 0,
  fundEphemeral: 20,
  squidrouterApprove: 10,
  squidrouterSwap: 10,
  moonbeamToPendulum: 40,
  assethubToPendulum: 24,
  subsidizePreSwap: 24,
  nablaApprove: 24,
  nablaSwap: 24,
  subsidizePostSwap: 24,
  spacewalkRedeem: 130,
  stellarPayment: 6,

  complete: 0,
  timedOut: 0,
  failed: 0,

  // The following are unused phases in the offramping process but are included for completeness.
  brlaTeleport: 30,
  moonbeamToPendulumXcm: 30,
  pendulumToAssethub: 0,
  pendulumToMoonbeam: 40,
  brlaPayoutOnMoonbeam: 120,
  stellarCreateAccount: 10,
};

const CIRCLE_RADIUS = 80;
const CIRCLE_STROKE_WIDTH = 12;

const ProgressCircle: FC<{
  displayedPercentage: number;
  showCheckmark: boolean;
  circumference: number;
}> = ({ displayedPercentage, showCheckmark, circumference }) => (
  <motion.div
    className="relative mt-12"
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.5, type: 'spring', stiffness: 260, damping: 20 }}
  >
    <svg className="w-[200px] h-[200px]" viewBox="0 0 200 200">
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <motion.circle
        cx="100"
        cy="100"
        r={CIRCLE_RADIUS}
        stroke="#E5E7EB"
        strokeWidth={CIRCLE_STROKE_WIDTH}
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        exit={{ pathLength: 0 }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
      />
      <motion.circle
        cx="100"
        cy="100"
        r={CIRCLE_RADIUS}
        stroke="url(#progressGradient)"
        strokeWidth={CIRCLE_STROKE_WIDTH}
        fill="none"
        transform="rotate(-90 100 100)"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - (circumference * displayedPercentage) / 100}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        transition={{ duration: 0.8, ease: 'easeInOut', delay: 0.2 }}
      />
    </svg>
    <div className="absolute top-0 left-0 flex items-center justify-center w-full h-full">
      {showCheckmark ? (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.5 }}>
          <CheckIcon className="w-12 h-12 text-blue-700" />
        </motion.div>
      ) : (
        <motion.span className="text-4xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          {Math.round(displayedPercentage)}%
        </motion.span>
      )}
    </div>
  </motion.div>
);

interface ProgressContentProps {
  currentPhase: RampPhase;
  currentPhaseIndex: number;
  message: string;
  showIsDelayedWarning: boolean;
  rampPhaseRecords: Record<RampPhase, number>;
}

const WarningBanner: FC = () => {
  const { t } = useTranslation();
  const rampState = useRampState();

  return (
    <section className="flex items-center gap-4 p-4 bg-yellow-400 border-l-8 border-yellow-700 rounded shadow-lg">
      <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
        <ExclamationCircleIcon className="w-12 text-yellow-800" />
      </motion.div>
      <div>
        <h1 className="text-xl font-extrabold text-yellow-900">{t('components.warningBanner.title')}</h1>
        <p className="text-sm font-medium text-yellow-900">
          {t('components.warningBanner.beforeUrl')}
          <a href={config.supportUrl} target="_blank" rel="noreferrer" className="underline">
            {t('components.warningBanner.url')}
          </a>
          {t('components.warningBanner.afterUrl')}
        </p>
        <p className="text-sm mt-2 font-medium text-yellow-900">
          Your transaction ID is <span className="">{rampState?.ramp?.id || 'N/A'}</span>.
        </p>
      </div>
    </section>
  );
};

const ProgressContent: FC<ProgressContentProps> = ({
  currentPhase,
  currentPhaseIndex,
  message,
  showIsDelayedWarning,
  rampPhaseRecords,
}) => {
  const { t } = useTranslation();

  const { selectedNetwork } = useNetwork();
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [displayedPercentage, setDisplayedPercentage] = useState(0);
  const circumference = CIRCLE_RADIUS * 2 * Math.PI;

  useProgressUpdate(
    currentPhase,
    currentPhaseIndex,
    rampPhaseRecords,
    displayedPercentage,
    setDisplayedPercentage,
    setShowCheckmark,
  );

  return (
    <Box className="flex flex-col items-center justify-center mt-4">
      <div className="flex flex-col items-center justify-center max-w-[400px]">
        {showIsDelayedWarning && <WarningBanner />}
        <ProgressCircle
          displayedPercentage={displayedPercentage}
          showCheckmark={showCheckmark}
          circumference={circumference}
        />
        <motion.h1
          className="my-3 text-base font-bold text-blue-700"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          {t('pages.progress.transactionInProgress')}
        </motion.h1>
        <motion.h1
          className="mb-3 text-base text-blue-700"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          {!isNetworkEVM(selectedNetwork)
            ? t('pages.progress.estimatedTimeAssetHub')
            : t('pages.progress.estimatedTimeEVM')}
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}>
          {message}
        </motion.p>
      </div>
    </Box>
  );
};

export const ProgressPage = () => {
  const { trackEvent } = useEventsContext();
  const rampState = useRampState();
  const { setRampState } = useRampActions();
  const { t } = useTranslation();

  const rampPhaseRecords = rampState?.ramp?.type === 'on' ? ONRAMPING_PHASE_SECONDS : OFFRAMPING_PHASE_SECONDS;

  const prevPhaseRef = useRef<RampPhase>(rampState?.ramp?.currentPhase || 'initial');
  const [currentPhase, setCurrentPhase] = useState<RampPhase>(prevPhaseRef.current);
  const currentPhaseIndex = Object.keys(rampPhaseRecords).indexOf(currentPhase);
  const message = getMessageForPhase(rampState, t);

  const showIsDelayedWarning = useMemo(() => {
    // Check if the last ramp update was more than 10 minutes ago
    if (rampState?.ramp?.updatedAt && rampState?.ramp?.currentPhase !== 'complete') {
      const updatedAt = new Date(rampState.ramp.updatedAt);
      const currentTime = new Date();
      const timeDiff = Math.abs(currentTime.getTime() - updatedAt.getTime());
      return timeDiff > 10 * 60 * 1000; // 10 minutes
    }
    return false;
  }, [rampState?.ramp?.currentPhase, rampState?.ramp?.updatedAt]);

  // TODO the recovery worker will change the 'updatedAt' field to the current time, so this will always be false
  console.log('showIsDelayedWarning', showIsDelayedWarning);

  useEffect(() => {
    // Only set up the polling if we have a ramp ID
    if (!rampState?.ramp?.id) return;

    // Extract the ramp ID once to avoid dependency on the entire rampState object
    const rampId = rampState.ramp.id;

    const fetchRampState = async () => {
      try {
        const updatedRampProcess = await RampService.getRampStatus(rampId);

        // Get the latest rampState from the store to ensure we're using current data
        const currentRampState = useRampStore.getState().rampState;
        if (currentRampState) {
          const updatedRampState = { ...currentRampState, ramp: updatedRampProcess };
          setRampState(updatedRampState);
        }

        const maybeNewPhase = updatedRampProcess.currentPhase;
        if (maybeNewPhase !== prevPhaseRef.current) {
          trackEvent({
            event: 'progress',
            phase_index: Object.keys(rampPhaseRecords).indexOf(maybeNewPhase),
            phase_name: maybeNewPhase,
          });

          prevPhaseRef.current = maybeNewPhase;
          setCurrentPhase(maybeNewPhase);
        }
      } catch (error) {
        console.error('Failed to fetch ramp state:', error);
      }
    };

    // Initial fetch
    fetchRampState();

    // Set up polling
    const intervalId = setInterval(fetchRampState, 5000);

    // Clean up
    return () => clearInterval(intervalId);
  }, [rampState?.ramp?.id, rampPhaseRecords, setRampState, trackEvent]); // Only depend on the ramp ID, not the entire state

  return (
    <main>
      <ProgressContent
        currentPhase={currentPhase}
        currentPhaseIndex={currentPhaseIndex}
        rampPhaseRecords={rampPhaseRecords}
        message={message}
        showIsDelayedWarning={showIsDelayedWarning}
      />
      <GotQuestions />
    </main>
  );
};
