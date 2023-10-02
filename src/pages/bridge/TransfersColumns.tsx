import { DocumentMagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { SpacewalkPrimitivesIssueIssueRequest, SpacewalkPrimitivesRedeemRedeemRequest } from '@polkadot/types/lookup';
import { ColumnDef } from '@tanstack/table-core';
import { DateTime } from 'luxon';
import { Button } from 'react-daisyui';
import { CopyableAddress } from '../../components/PublicKey';
import { toTitle } from '../../helpers/string';
import { TenantName } from '../../models/Tenant';
export type TransferStatus = 'Pending' | 'Completed' | 'Cancelled' | 'Reimbursed' | 'Failed' | 'Retried';

export enum TransferType {
  issue = 'issue',
  redeem = 'redeem',
}

export interface TTransfer {
  updated: DateTime;
  amount: string;
  asset?: string;
  transactionId: string;
  type: TransferType;
  status: TransferStatus;
  original: SpacewalkPrimitivesIssueIssueRequest | SpacewalkPrimitivesRedeemRedeemRequest;
}

export interface UserStaking {
  candidateId: string;
  amount: string;
}

export const updatedColumn: ColumnDef<TTransfer> = {
  header: 'Updated',
  accessorKey: 'updated',
  cell: ({ row }) => {
    return <div>{row.original.updated.toLocaleString(DateTime.DATETIME_SHORT)}</div>;
  },
};

export const amountColumn: ColumnDef<TTransfer> = {
  header: 'Amount',
  accessorKey: 'amount',
};

export const assetColumn: ColumnDef<TTransfer> = {
  header: 'Asset',
  accessorKey: 'asset',
};

export const transactionIdColumn: ColumnDef<TTransfer> = {
  header: 'Request ID',
  accessorKey: 'transactionId',
  cell: ({ row }) => {
    return <CopyableAddress publicKey={row.original.transactionId} variant="hexa" />;
  },
};

export const typeColumnCreator = (tenantName: TenantName | undefined): ColumnDef<TTransfer> => ({
  header: 'Type',
  accessorKey: 'type',
  accessorFn: (row) => (row.type === TransferType.issue ? `To ${toTitle(tenantName || '')}` : 'Back to Stellar'),
});

export const statusColumn: ColumnDef<TTransfer> = {
  header: 'Status',
  accessorKey: 'status',
  cell: ({ row }) => {
    return (
      <div className={'status-box ' + row.original.status.toLowerCase()}>
        <div className={'status-dot ' + row.original.status.toLowerCase()}></div>
        <div>{row.original.status}</div>
      </div>
    );
  },
};

export const detailsColumnCreator = (onClick: (t: TTransfer) => void): ColumnDef<TTransfer> => ({
  header: 'Details',
  accessorKey: 'details',
  cell: ({ row }) => {
    return (
      row.original.status !== 'Retried' && (
        <Button color="ghost" onClick={() => onClick(row.original)}>
          <div className="w-5 m-auto details-link">
            <DocumentMagnifyingGlassIcon />
          </div>
        </Button>
      )
    );
  },
});
