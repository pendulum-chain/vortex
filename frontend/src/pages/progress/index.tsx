import { FC, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckIcon } from '@heroicons/react/20/solid';
import { useTranslation } from 'react-i18next';

import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { isNetworkEVM, RampPhase, CleanupPhase } from 'shared';
import { GotQuestions } from '../../sections/GotQuestions';
import { useRampActions, useRampState, useRampStore } from '../../stores/offrampStore';
import { RampService } from '../../services/api';
import { getMessageForPhase } from './phaseMessages';

const useProgressUpdate = (
  currentPhase: RampPhase,
  currentPhaseIndex: number,
  displayedPercentage: number,
  setDisplayedPercentage: (value: (prev: number) => number) => void,
  setShowCheckmark: (value: boolean) => void,
) => {
  const phaseStartTime = useRef(Date.now());
  const phaseStartPercentage = useRef(displayedPercentage);

  useEffect(() => {
    const targetPercentage = Math.round((100 / numberOfPhases) * (currentPhaseIndex + 1));
    const duration = OFFRAMPING_PHASE_SECONDS[currentPhase] * 1000;

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
  }, [currentPhase, currentPhaseIndex, displayedPercentage, setDisplayedPercentage, setShowCheckmark]);
};

export const OFFRAMPING_PHASE_SECONDS: Record<RampPhase | CleanupPhase, number> = {
  complete: 0,
  brlaTeleport: 0,
  failed: 0,
  initial: 0,

  pendulumToAssethub: 0,
  squidrouterApprove: 10,
  squidrouterSwap: 10,
  fundEphemeral: 30,
  moonbeamToPendulum: 40,
  assethubToPendulum: 24,
  subsidizePreSwap: 24,
  nablaApprove: 24,
  nablaSwap: 24,
  subsidizePostSwap: 24,
  spacewalkRedeem: 130,
  pendulumCleanup: 6,
  stellarPayment: 6,
  pendulumToMoonbeam: 40,
  brlaPayoutOnMoonbeam: 120,
  stellarCreateAccount: 10,
  moonbeamToPendulumXcm: 30,
  moonbeamCleanup: 30,
  stellarCleanup: 6, // Added missing cleanup phase
};

const CIRCLE_RADIUS = 80;
const CIRCLE_STROKE_WIDTH = 12;
const numberOfPhases = Object.keys(OFFRAMPING_PHASE_SECONDS).length;

interface ProgressContentProps {
  currentPhase: RampPhase;
  currentPhaseIndex: number;
  message: string;
}

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

const ProgressContent: FC<ProgressContentProps> = ({ currentPhase, currentPhaseIndex, message }) => {
  const { selectedNetwork } = useNetwork();
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [displayedPercentage, setDisplayedPercentage] = useState(0);
  const circumference = CIRCLE_RADIUS * 2 * Math.PI;

  const { t } = useTranslation();

  useProgressUpdate(currentPhase, currentPhaseIndex, displayedPercentage, setDisplayedPercentage, setShowCheckmark);

  return (
    <Box className="flex flex-col items-center justify-center mt-4">
      <div className="flex flex-col items-center justify-center max-w-[400px]">
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

  const prevPhaseRef = useRef<RampPhase>(rampState?.ramp?.currentPhase || 'initial');
  const [currentPhase, setCurrentPhase] = useState<RampPhase>(prevPhaseRef.current);
  const currentPhaseIndex = Object.keys(OFFRAMPING_PHASE_SECONDS).indexOf(currentPhase);
  const message = getMessageForPhase(rampState, t);
  
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
            phase_index: Object.keys(OFFRAMPING_PHASE_SECONDS).indexOf(maybeNewPhase),
            phase_name: maybeNewPhase
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
  }, [rampState?.ramp?.id, setRampState, trackEvent]); // Only depend on the ramp ID, not the entire state
  
  return (
    <BaseLayout
      main={
        <main>
          <ProgressContent
            currentPhase={currentPhase}
            currentPhaseIndex={currentPhaseIndex}
            message={message}
          />
          <GotQuestions />
        </main>
      }
    />
  );
};
