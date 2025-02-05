import { FC, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ExclamationCircleIcon, CheckIcon } from '@heroicons/react/20/solid';

import { OfframpingPhase, OfframpingState } from '../../services/offrampingFlow';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { isNetworkEVM } from '../../helpers/networks';
import { createOfframpingPhaseMessage } from './helpers';
import { useCountdownTimer } from '../../hooks/useCountdownTimer';
import { GotQuestions } from '../../sections/GotQuestions';

const useProgressUpdate = (
  currentPhase: OfframpingPhase,
  currentPhaseIndex: number,
  displayedPercentage: number,
  setDisplayedPercentage: (value: (prev: number) => number) => void,
  setShowCheckmark: (value: boolean) => void,
  setRemainingTime: (value: number) => void,
) => {
  useEffect(() => {
    const targetPercentage = Math.round((100 / numberOfPhases) * (currentPhaseIndex + 1));
    const duration = OFFRAMPING_PHASE_SECONDS[currentPhase] * 1000;
    const increment = Math.max(1, Math.floor((targetPercentage - displayedPercentage) / (duration / 200)));

    const intervalId = setInterval(() => {
      setDisplayedPercentage((prev) => {
        if (prev >= targetPercentage) {
          clearInterval(intervalId);
          if (currentPhaseIndex === numberOfPhases - 1) {
            setShowCheckmark(true);
          }
          return prev;
        }
        return Math.min(prev + increment, targetPercentage);
      });
    }, 350);

    setRemainingTime(duration / 1000);
    return () => clearInterval(intervalId);
  }, [
    currentPhase,
    currentPhaseIndex,
    displayedPercentage,
    setDisplayedPercentage,
    setRemainingTime,
    setShowCheckmark,
  ]);
};

export const OFFRAMPING_PHASE_SECONDS: Record<OfframpingPhase, number> = {
  prepareTransactions: 1,
  squidRouter: 1,
  pendulumFundEphemeral: 80,
  executeMoonbeamXCM: 40,
  executeAssetHubXCM: 24,
  subsidizePreSwap: 24,
  nablaApprove: 24,
  nablaSwap: 24,
  subsidizePostSwap: 24,
  executeSpacewalkRedeem: 130,
  pendulumCleanup: 6,
  stellarOfframp: 6,
  stellarCleanup: 6,
};

const CIRCLE_RADIUS = 80;
const CIRCLE_STROKE_WIDTH = 12;
const numberOfPhases = Object.keys(OFFRAMPING_PHASE_SECONDS).length;

interface ProgressPageProps {
  offrampingState: OfframpingState;
}

interface ProgressContentProps {
  currentPhase: OfframpingPhase;
  currentPhaseIndex: number;
  message: string;
}

const WarningSection: FC = () => (
  <section className="flex items-center gap-4 p-4 bg-yellow-500 border-l-8 border-yellow-700 rounded shadow-lg">
    <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
      <ExclamationCircleIcon className="w-12 text-yellow-800" />
    </motion.div>
    <div>
      <h1 className="text-xl font-extrabold text-yellow-900 uppercase">Do not close this tab!</h1>
      <p className="text-sm font-medium text-yellow-900">
        Closing this tab can result in your transaction failing. Please wait until it&apos;s completed.
      </p>
    </div>
  </section>
);

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
          {displayedPercentage}%
        </motion.span>
      )}
    </div>
  </motion.div>
);

const ProgressContent: FC<ProgressContentProps> = ({ currentPhase, currentPhaseIndex, message }) => {
  const { selectedNetwork } = useNetwork();
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [displayedPercentage, setDisplayedPercentage] = useState(0);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const circumference = CIRCLE_RADIUS * 2 * Math.PI;

  useProgressUpdate(
    currentPhase,
    currentPhaseIndex,
    displayedPercentage,
    setDisplayedPercentage,
    setShowCheckmark,
    setRemainingTime,
  );
  useCountdownTimer(remainingTime, setRemainingTime);

  return (
    <Box className="flex flex-col items-center justify-center mt-4">
      <div className="flex flex-col items-center justify-center max-w-[400px]">
        <WarningSection />
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
          Your transaction is in progress.
        </motion.h1>
        <motion.h1
          className="mb-3 text-base text-blue-700"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          {!isNetworkEVM(selectedNetwork) ? 'This usually takes 4-6 minutes.' : 'This usually takes 6-8 minutes.'}
        </motion.h1>
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <div className="mb-2">{message}</div>
          {remainingTime !== null && (
            <p className="text-sm text-gray-500">Estimated time left: {remainingTime} seconds</p>
          )}
        </motion.div>
      </div>
    </Box>
  );
};

export const ProgressPage: FC<ProgressPageProps> = ({ offrampingState }) => {
  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const currentPhase = offrampingState.phase as OfframpingPhase;
  const currentPhaseIndex = Object.keys(OFFRAMPING_PHASE_SECONDS).indexOf(currentPhase);
  const message = createOfframpingPhaseMessage(offrampingState, selectedNetwork);

  useEffect(() => {
    trackEvent({ event: 'progress', phase_index: currentPhaseIndex, phase_name: offrampingState.phase });
  }, [currentPhaseIndex, trackEvent, offrampingState.phase]);

  return (
    <BaseLayout
      main={
        <main>
          <ProgressContent currentPhase={currentPhase} currentPhaseIndex={currentPhaseIndex} message={message} />
          <GotQuestions />
        </main>
      }
    />
  );
};
