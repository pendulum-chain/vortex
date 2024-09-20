import { FC } from 'preact/compat';
import { ExclamationCircleIcon } from '@heroicons/react/20/solid';
import { OfframpingPhase, OfframpingState } from '../../services/offrampingFlow';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';

const OFFRAMPING_PHASE_MESSAGES: Record<OfframpingPhase, string> = {
  prepareTransactions: '1/12: Preparing transactions',
  squidRouter: '2/12: Bridging assets via Axelar',
  pendulumFundEphemeral: '3/12: Creating Pendulum ephemeral account',
  executeXCM: '4/12: Bridging assets via XCM',
  subsidizePreSwap: '5/12: Compensating swap risk',
  nablaApprove: '6/12: Approving Forex AMM',
  nablaSwap: '7/12: Swapping on Forex AMM',
  subsidizePostSwap: '8/12: Compensating swap risk',
  executeSpacewalkRedeem: '9/12: Bridging assets via Spacewalk',
  pendulumCleanup: '10/12: Cleaning up Pendulum ephemeral account',
  stellarOfframp: '11/12: Offramping on Stellar',
  stellarCleanup: '12/12: Cleaning up Stellar ephemeral account',
};

interface ProgressPageProps {
  offrampingState: OfframpingState;
}

export const ProgressPage: FC<ProgressPageProps> = ({ offrampingState }) => {
  const phaseMessage =
    offrampingState.phase === 'success' ? undefined : OFFRAMPING_PHASE_MESSAGES[offrampingState.phase];

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
