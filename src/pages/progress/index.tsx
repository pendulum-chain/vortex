import { useEffect, useState } from 'preact/hooks';
import { ExclamationCircleIcon } from '@heroicons/react/20/solid';
import { Box } from '../../components/Box';
import { BaseLayout } from '../../layouts';
import { SuccessModal } from '../../components/modals/SuccessModal';

const handleTabClose = (event: Event) => {
  event.preventDefault();
};

export const ProgressPage = () => {
  // useEffect(() => {
  //   window.addEventListener('beforeunload', handleTabClose);

  //   return () => {
  //     window.removeEventListener('beforeunload', handleTabClose);
  //   };
  // }, []);

  const [isVisible, setIsVisible] = useState(false);

  const modals = (
    <SuccessModal
      visible={isVisible}
      onClose={() => {
        return null;
      }}
    />
  );

  const main = (
    <main>
      <Box className="flex flex-col items-center justify-center mt-12">
        <div className="flex flex-col items-center justify-center">
          <ExclamationCircleIcon className="text-red-500 w-36" />
          <h1 className="text-3xl font-bold text-red-500 my-7">DO NOT CLOSE THIS TAB!</h1>
          <p>Your transaction is in progress.</p>
          <button onClick={() => setIsVisible(true)}>AAAAAA</button>
          <progress className="w-full progress my-7 progress-info"></progress>
          <p className="text-sm text-gray-400">Closing this tab can result in the transaction not being processed.</p>
        </div>
      </Box>
    </main>
  );

  return <BaseLayout main={main} modals={modals} />;
};
