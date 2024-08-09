import { FC, StateUpdater, useEffect } from 'preact/compat';
import { ExclamationCircleIcon } from '@heroicons/react/20/solid';
import { FinalOfframpingPhase, OfframpingPhase } from '../../services/offrampingFlow';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';

const handleTabClose = (event: Event) => {
  event.preventDefault();
};

interface ProgressPageProps {
  setOfframpingPhase: StateUpdater<OfframpingPhase | FinalOfframpingPhase | undefined>;
}

export const ProgressPage: FC<ProgressPageProps> = ({ setOfframpingPhase }) => {
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

  const main = (
    <main>
      <Box className="flex flex-col items-center justify-center mt-12">
        <div className="flex flex-col items-center justify-center">
          <ExclamationCircleIcon className="text-red-500 w-36" />
          <h1 className="text-3xl font-bold text-red-500 my-7">DO NOT CLOSE THIS TAB!</h1>
          <p>Your transaction is in progress.</p>
          <progress className="w-full progress my-7 progress-info"></progress>
          <p className="text-sm text-gray-400">Closing this tab can result in the transaction not being processed.</p>
        </div>
      </Box>
    </main>
  );

  return <BaseLayout main={main} />;
};
