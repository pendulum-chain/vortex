import { FC, useEffect, useRef, useState } from 'preact/compat';
import { ExclamationCircleIcon } from '@heroicons/react/20/solid';
import { OfframpingPhase, OfframpingState } from '../../services/offrampingFlow';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';
import { useEventsContext } from '../../contexts/events';
import { getInputTokenDetailsOrDefault, OUTPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import { useNetwork } from '../../contexts/network';
import { Networks, isNetworkEVM, getNetworkDisplayName } from '../../helpers/networks';

function createOfframpingPhaseMessage(offrampingState: OfframpingState, network: Networks): string {
  const inputToken = getInputTokenDetailsOrDefault(network, offrampingState.inputTokenType);
  const outputToken = OUTPUT_TOKEN_CONFIG[offrampingState.outputTokenType];
  const { phase } = offrampingState;

  if (phase === 'success') return 'Transaction completed successfully';

  const messages: Record<OfframpingPhase, string> = {
    prepareTransactions: isNetworkEVM(network)
      ? `Bridging ${inputToken.assetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputToken.assetSymbol} from AssetHub --> Pendulum`,
    squidRouter: isNetworkEVM(network)
      ? `Bridging ${inputToken.assetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputToken.assetSymbol} from AssetHub --> Pendulum`,
    pendulumFundEphemeral: isNetworkEVM(network)
      ? `Bridging ${inputToken.assetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputToken.assetSymbol} from AssetHub --> Pendulum`,
    executeMoonbeamXCM: `Transferring ${inputToken.assetSymbol} from Moonbeam --> Pendulum`,
    executeAssetHubXCM: `Bridging ${inputToken.assetSymbol} from AssetHub --> Pendulum`,
    subsidizePreSwap: `Swapping to ${outputToken.stellarAsset.code.string} on Vortex DEX`,
    nablaApprove: `Swapping to ${outputToken.stellarAsset.code.string} on Vortex DEX`,
    nablaSwap: `Swapping to ${outputToken.stellarAsset.code.string} on Vortex DEX`,
    subsidizePostSwap: `Swapping to ${outputToken.stellarAsset.code.string} on Vortex DEX`,
    executeSpacewalkRedeem: `Bridging ${outputToken.stellarAsset.code.string} to Stellar via Spacewalk`,
    pendulumCleanup: 'Transferring to local partner for bank transfer',
    stellarOfframp: 'Transferring to local partner for bank transfer',
    stellarCleanup: 'Transferring to local partner for bank transfer',
  };

  return messages[phase as OfframpingPhase];
}

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
const CIRCLE_STROKE_WIDTH = 8;
const numberOfPhases = Object.keys(OFFRAMPING_PHASE_SECONDS).length;

interface ProgressPageProps {
  offrampingState: OfframpingState;
}

const WarningSection: FC = () => (
  <section className="flex">
    <ExclamationCircleIcon className="w-12 text-yellow-500" />
    <div className="pl-5">
      <h1 className="text-lg font-bold text-yellow-500">Do not close this tab</h1>
      <p className="text-sm text-yellow-500">Closing this tab can result in the transaction not being processed.</p>
    </div>
  </section>
);

const ProgressContent: FC<{
  currentPhase: OfframpingPhase;
  currentPhaseIndex: number;
  message: string;
}> = ({ currentPhase, currentPhaseIndex, message }) => {
  const { selectedNetwork } = useNetwork();

  const [currentPercentage, setCurrentPercentage] = useState<number>(
    Math.round((100 / numberOfPhases) * currentPhaseIndex),
  );
  const [targetPhaseIndex, setTargetPhaseIndex] = useState<number>(currentPhaseIndex);
  const currentPhaseRef = useRef<OfframpingPhase>(currentPhase);
  const currentPhaseIndexRef = useRef<number>(currentPhaseIndex);
  const currentPhaseStartPercentage = useRef<number>((100 / numberOfPhases) * currentPhaseIndex);
  const expectedEndTimeOfPhase = useRef<number>(Date.now() + OFFRAMPING_PHASE_SECONDS[currentPhase] * 1000);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentPhaseEndPercentage = (100 / numberOfPhases) * (currentPhaseIndexRef.current + 1);
      // ratio = 1 -> still at currentPhaseStartPercentage, ratio = 0 -> currentPhaseEndPercentage reached
      const ratio = Math.max(
        0,
        (expectedEndTimeOfPhase.current - Date.now()) / (OFFRAMPING_PHASE_SECONDS[currentPhaseRef.current] * 1000),
      );
      setCurrentPercentage(
        Math.round(currentPhaseEndPercentage * (1 - ratio) + currentPhaseStartPercentage.current * ratio),
      );
    });
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setTargetPhaseIndex(currentPhaseIndex + 1);

    if (currentPhaseRef.current !== currentPhase) {
      currentPhaseRef.current = currentPhase;
      currentPhaseIndexRef.current = currentPhaseIndex;
      expectedEndTimeOfPhase.current = Date.now() + OFFRAMPING_PHASE_SECONDS[currentPhase] * 1000;
      currentPhaseStartPercentage.current = currentPercentage;
    }
  }, [currentPercentage, currentPhase, currentPhaseIndex]);

  return (
    <Box className="flex flex-col items-center justify-center mt-4">
      <div className="flex flex-col items-center justify-center max-w-[400px]">
        <WarningSection />
        <div className="relative mt-12">
          <svg
            className="w-[200px] h-[200px] dark:text-white"
            style={{ transform: 'scale()' }}
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 200 200"
          >
            <circle
              cx="100"
              cy="100"
              r={CIRCLE_RADIUS}
              stroke="rgb(132, 211, 245)"
              strokeWidth={CIRCLE_STROKE_WIDTH}
              style={{
                strokeDasharray: `${((CIRCLE_RADIUS * 2 * Math.PI) / numberOfPhases) * targetPhaseIndex} ${
                  CIRCLE_RADIUS * 2 * Math.PI
                }`,
                transition: `${OFFRAMPING_PHASE_SECONDS[currentPhase]}s linear`,
                transform: 'rotate(-90deg)',
                transformOrigin: '50% 50%',
              }}
            ></circle>
            <circle
              cx="100"
              cy="100"
              r={CIRCLE_RADIUS + CIRCLE_STROKE_WIDTH}
              stroke="rgb(81, 184, 170)"
              strokeWidth={CIRCLE_STROKE_WIDTH}
            ></circle>
          </svg>
          <div className="absolute top-0 left-0 flex items-center justify-center w-full h-full text-4xl">
            {currentPercentage}%
          </div>
        </div>
        <h1 className="my-3 text-base font-bold text-blue-700">Your transaction is in progress.</h1>
        <h1 className="mb-3 text-base text-blue-700">
          {!isNetworkEVM(selectedNetwork) ? 'This usually takes 4-6 minutes.' : 'This usually takes 6-8 minutes.'}
        </h1>
        <div>{message}</div>
      </div>
    </Box>
  );
};

export const ProgressPage: FC<ProgressPageProps> = ({ offrampingState }) => {
  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const currentPhase = offrampingState.phase as OfframpingPhase; // this component will not be shown if the phase is 'success'
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
        </main>
      }
    />
  );
};
