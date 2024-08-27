import { FC, StateUpdater, useEffect } from 'preact/compat';
import { ExclamationCircleIcon } from '@heroicons/react/20/solid';
import { FinalOfframpingPhase, OfframpingPhase } from '../../services/offrampingFlow';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';

const OFFRAMPING_PHASE_MESSAGES: Record<OfframpingPhase, string> = {
  prepareTransactions: '1/11: Preparing transactions',
  squidRouter: '2/11: Bridging assets via Axelar',
  pendulumFundEphemeral: '3/11: Creating Pendulum ephemeral account',
  subsidizePreSwap: '4/11: Compensating swap risk',
  nablaApprove: '5/11: Approving Forex AMM',
  nablaSwap: '6/11: Swapping on Forex AMM',
  subsidizePostSwap: '7/11: Compensating swap risk',
  executeSpacewalkRedeem: '8/11: Bridging assets via Spacewalk',
  pendulumCleanup: '9/11: Cleaning up Pendulum ephemeral account',
  stellarOfframp: '10/11: Offramping on Stellar',
  stellarCleanup: '11/11: Cleaning up Stellar ephemeral account',
};

const handleTabClose = (event: Event) => {
  event.preventDefault();
};

interface ProgressPageProps {
  setOfframpingPhase: StateUpdater<OfframpingPhase | FinalOfframpingPhase | undefined>;
  offrampingPhase: OfframpingPhase | FinalOfframpingPhase | undefined;
}

export const ProgressPage: FC<ProgressPageProps> = ({ setOfframpingPhase, offrampingPhase }) => {
  // After 15 minutes of waiting, we want to redirect user to the failure page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setOfframpingPhase('failure');
    }, 15 * 60 * 1000);

    window.addEventListener('beforeunload', handleTabClose);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', handleTabClose);
    };
  }, [setOfframpingPhase]);

  const phaseMessage =
    offrampingPhase === undefined || offrampingPhase === 'failure' || offrampingPhase === 'success'
      ? undefined
      : OFFRAMPING_PHASE_MESSAGES[offrampingPhase];

  const main = (
    <main>
      <Box className="flex flex-col items-center justify-center mt-12">
        <div className="flex flex-col items-center justify-center">
          <ExclamationCircleIcon className="text-red-500 w-36" />
          <h1 className="text-3xl font-bold text-red-500 my-7">DO NOT CLOSE THIS TAB!</h1>
          <p>Your transaction is in progress.</p>
          {phaseMessage && <p>{phaseMessage}</p>}
          <progress className="w-full progress my-7 progress-info"></progress>
          <p className="text-sm text-gray-400">Closing this tab can result in the transaction not being processed.</p>
        </div>
      </Box>
    </main>
  );

  return <BaseLayout main={main} />;
};
