import { useSwapPools } from '../../../hooks/nabla/useSwapPools';
import ModalProvider from '../../../services/modal';
import Table from '../../Table';
import { columns } from './columns';
import PoolsModals from './Modals';

const SwapPools = (): JSX.Element | null => {
  const { data, isLoading } = useSwapPools();

  return (
    <ModalProvider>
      <PoolsModals />
      <Table data={data} isLoading={isLoading} columns={columns} search />
    </ModalProvider>
  );
};

export default SwapPools;
