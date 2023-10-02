import { CellContext, ColumnDef } from '@tanstack/react-table';
import { Button } from 'react-daisyui';
import { SwapPool } from '../../../../gql/graphql';
import { useModalToggle } from '../../../services/modal';
import { LiquidityModalProps, ModalTypes } from './Modals/types';

export type SwapPoolColumn = SwapPool & {
  wallet?: unknown;
  myAmount?: unknown;
  coverage?: unknown;
};

export const nameColumn: ColumnDef<SwapPoolColumn> = {
  header: 'Name',
  accessorKey: 'name',
  accessorFn: (row) => row.token?.name || '',
  enableSorting: true,
} as const;

export const walletColumn: ColumnDef<SwapPoolColumn> = {
  header: 'Wallet',
  accessorKey: 'wallet',
  accessorFn: (row) => row.wallet?.toString(),
  enableSorting: true,
} as const;

export const myAmountColumn: ColumnDef<SwapPoolColumn> = {
  header: 'My Pool Amount',
  accessorKey: 'myAmount',
  accessorFn: (row) => row.myAmount?.toString(),
  enableSorting: true,
} as const;

export const liabilitiesColumn: ColumnDef<SwapPoolColumn> = {
  header: 'Pool liabilities',
  accessorKey: 'liabilities',
  accessorFn: (row) => row.liabilities?.toString(),
  enableSorting: true,
} as const;

export const coverageColumn: ColumnDef<SwapPoolColumn> = {
  header: 'Coverage Ratio',
  accessorKey: 'coverage',
  accessorFn: (row) => row.coverage?.toString(),
  enableSorting: true,
} as const;

export const aprColumn: ColumnDef<SwapPoolColumn> = {
  header: 'APR',
  accessorKey: 'apr',
  accessorFn: (row) => row.reserves?.toString(), // TODO: get apr
  enableSorting: true,
} as const;

const ActionsColumn = ({ row: { original } }: CellContext<SwapPoolColumn, unknown>): JSX.Element | null => {
  const toggle = useModalToggle<LiquidityModalProps>();
  return (
    <div className="flex items-center gap-2 text-right">
      <Button
        onClick={() => toggle({ type: ModalTypes.AddLiquidity, props: { data: original } })}
        size="sm"
        variant="outline"
        className="px-3"
      >
        Deposit
      </Button>
      <Button
        onClick={() =>
          toggle({
            type: ModalTypes.WithdrawLiquidity,
            props: { data: original },
          })
        }
        size="sm"
        variant="outline"
        className="px-3"
      >
        Withdraw
      </Button>
    </div>
  );
};

export const actionsColumn: ColumnDef<SwapPoolColumn> = {
  header: '',
  accessorKey: 'address',
  enableSorting: false,
  enableGlobalFilter: false,
  enableColumnFilter: false,
  size: 150,
  cell: (props): JSX.Element | null => <ActionsColumn {...props} />,
} as const;

export const columns = [
  nameColumn,
  walletColumn,
  myAmountColumn,
  liabilitiesColumn,
  coverageColumn,
  aprColumn,
  actionsColumn,
];
