import { FC, useEffect } from 'preact/compat';
import { ExclamationCircleIcon } from '@heroicons/react/20/solid';
import { OfframpingPhase, OfframpingState } from '../../services/offrampingFlow';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';
import { useEventsContext } from '../../contexts/events';

const OFFRAMPING_PHASE_MESSAGES: Record<OfframpingPhase, string> = {
  prepareTransactions: 'Preparing transactions',
  squidRouter: 'Bridging assets via Axelar',
  pendulumFundEphemeral: 'Creating Pendulum ephemeral account',
  executeXCM: 'Bridging assets via XCM',
  subsidizePreSwap: 'Compensating swap risk',
  nablaApprove: 'Approving Forex AMM',
  nablaSwap: 'Swapping on Forex AMM',
  subsidizePostSwap: 'Compensating swap risk',
  executeSpacewalkRedeem: 'Bridging assets via Spacewalk',
  pendulumCleanup: 'Cleaning up Pendulum ephemeral account',
  stellarOfframp: 'Offramping on Stellar',
  stellarCleanup: 'Cleaning up Stellar ephemeral account',
};

interface ProgressPageProps {
  offrampingState: OfframpingState;
}

const ProgressSteps: FC<{ currentPhaseIndex: number }> = ({ currentPhaseIndex }) => (
  <ul className="steps steps-vertical">
    {Object.entries(OFFRAMPING_PHASE_MESSAGES).map(([phase, message], index) => (
      <li
        key={phase}
        className={`step step-vortex after:border-2 after:border-blue-700 after:bg-white ${
          index <= currentPhaseIndex ? 'step-primary' : ''
        }`}
      >
        <p className="text-sm">{message}</p>
      </li>
    ))}
  </ul>
);

const WarningSection: FC = () => (
  <section className="flex">
    <ExclamationCircleIcon className="w-12 text-yellow-500" />
    <div className="pl-5">
      <h1 className="text-lg font-bold text-yellow-500">Do not close this tab</h1>
      <p className="text-sm text-yellow-500">Closing this tab can result in the transaction not being processed.</p>
    </div>
  </section>
);

const ProgressContent: FC<{ currentPhaseIndex: number }> = ({ currentPhaseIndex }) => (
  <Box className="flex flex-col items-center justify-center mt-4">
    <div className="flex flex-col items-center justify-center max-w-[400px]">
      <span className="w-10 text-blue-700 loading loading-spinner"></span>
      <h1 className="my-3 text-xl font-bold text-blue-700">Your transaction is in progress.</h1>
      <WarningSection />
      <div className="h-0.5 m-auto w-full bg-blue-700 mt-3 mb-1" />
      <ProgressSteps currentPhaseIndex={currentPhaseIndex} />
    </div>
  </Box>
);

export const ProgressPage: FC<ProgressPageProps> = ({ offrampingState }) => {
  const { trackEvent } = useEventsContext();

  const currentPhaseIndex = Object.keys(OFFRAMPING_PHASE_MESSAGES).indexOf(offrampingState.phase);

  useEffect(() => {
    trackEvent({ event: 'progress', phase: currentPhaseIndex, name: offrampingState.phase });
  }, [currentPhaseIndex, trackEvent]);

  return (
    <BaseLayout
      main={
        <main>
          <ProgressContent currentPhaseIndex={currentPhaseIndex} />
        </main>
      }
    />
  );
};
