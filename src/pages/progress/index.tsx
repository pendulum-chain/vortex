import { FC } from 'preact/compat';
import { ExclamationCircleIcon } from '@heroicons/react/20/solid';
import { OfframpingPhase, OfframpingState } from '../../services/offrampingFlow';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';

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
  <Box className="flex flex-col items-center justify-center mt-12">
    <div className="flex flex-col items-center justify-center max-w-[400px]">
      <span className="w-20 text-blue-700 loading loading-spinner"></span>
      <h1 className="text-xl font-bold text-blue-700 my-7">Your transaction is in progress.</h1>
      <WarningSection />
      <div className="h-0.5 m-auto w-full bg-blue-700 mt-8 mb-5" />
      <ProgressSteps currentPhaseIndex={currentPhaseIndex} />
    </div>
  </Box>
);

export const ProgressPage: FC<ProgressPageProps> = ({ offrampingState }) => {
  const currentPhaseIndex = Object.keys(OFFRAMPING_PHASE_MESSAGES).indexOf(offrampingState.phase);

  return (
    <BaseLayout
      main={
        <main className="pb-12">
          <ProgressContent currentPhaseIndex={currentPhaseIndex} />
        </main>
      }
    />
  );
};
