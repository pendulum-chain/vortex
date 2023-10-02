import { WalletAccount } from '@talismn/connect-wallets';
import { ColumnDef } from '@tanstack/table-core';
import { StateUpdater } from 'preact/hooks';
import { Button } from 'react-daisyui';
import UnlinkIcon from '../../assets/UnlinkIcon';
import { CopyableAddress } from '../../components/PublicKey';
import { ParachainStakingCandidate } from '../../hooks/staking/staking';
import { PalletIdentityInfo } from '../../hooks/useIdentityPallet';
import { nativeToFormat } from '../../shared/parseNumbers';

export interface TCollator {
  candidate: ParachainStakingCandidate;
  collator: string;
  totalStaked: string;
  delegators: number;
  apy: string;
  identityInfo?: PalletIdentityInfo;
}

export interface UserStaking {
  candidateId: string;
  amount: string;
}

const getAmountDelegated = (candidate: ParachainStakingCandidate, address: string) =>
  candidate.delegators.find(({ owner }) => owner === address)?.amount;

export const nameColumn: ColumnDef<TCollator> = {
  header: 'Collator',
  accessorKey: 'collator',
  enableMultiSort: true,
  accessorFn: ({ identityInfo }) => identityInfo?.display || '0',
  cell: ({ row }) => {
    const desc = row.original.identityInfo
      ? `${row.original.identityInfo.email ? row.original.identityInfo.email + '\n' : ''}` +
        `${row.original.identityInfo.riot ? row.original.identityInfo.riot + '\n' : ''}` +
        `${row.original.identityInfo.twitter ? row.original.identityInfo.twitter + '\n' : ''}` +
        `${row.original.identityInfo.web ? row.original.identityInfo.web + '\n' : ''}`
      : '';
    return (
      <div className="flex flex-row" title={desc}>
        <div className="mr-2">{(row.original.identityInfo ? row.original.identityInfo.display : 'Unknown') + ' |'}</div>
        <CopyableAddress publicKey={row.original.candidate.id} variant="short" inline />
      </div>
    );
  },
};

export const stakedColumn: ColumnDef<TCollator> = {
  header: 'Total Staked',
  accessorKey: 'totalStaked',
};

export const delegatorsColumn: ColumnDef<TCollator> = {
  header: 'Delegators',
  accessorKey: 'delegators',
  enableMultiSort: true,

  accessorFn: ({ delegators }) => delegators?.toString(),
};

export const apyColumn: ColumnDef<TCollator> = {
  header: 'APY',
  accessorKey: 'apy',
};

export const myStakedColumn = ({
  userAccountAddress,
  tokenSymbol,
}: {
  userAccountAddress: string;
  tokenSymbol?: string;
}): ColumnDef<TCollator> => ({
  header: 'My Staked',
  accessorKey: 'myStaked',
  enableMultiSort: true,
  accessorFn: ({ candidate }) => getAmountDelegated(candidate, userAccountAddress) || '0',
  cell: ({ row }) => {
    const amountDelegated = getAmountDelegated(row.original.candidate, userAccountAddress);
    return <div>{amountDelegated ? nativeToFormat(amountDelegated, tokenSymbol) : ''}</div>;
  },
});

export const actionsColumn = ({
  userAccountAddress,
  walletAccount,
  userStaking,
  setSelectedCandidate,
  setUnstaking,
}: {
  userAccountAddress: string;
  walletAccount: WalletAccount | undefined;
  userStaking: UserStaking | undefined;
  setSelectedCandidate: StateUpdater<ParachainStakingCandidate | undefined>;
  setUnstaking: StateUpdater<boolean>;
}): ColumnDef<TCollator> => ({
  header: '',
  enableSorting: false,
  accessorKey: 'actions',
  cell: ({ row }) => {
    const showUnstake = Boolean(getAmountDelegated(row.original.candidate, userAccountAddress));
    const showStake = walletAccount && (!userStaking || showUnstake);
    return (
      <div className="flex flex-row justify-start">
        <Button
          className="mr-2 text-primary"
          size="sm"
          color="ghost"
          onClick={() => {
            setUnstaking(true);
            setSelectedCandidate(row.original.candidate);
          }}
          startIcon={<UnlinkIcon className="w-4 h-4" />}
          disabled={!showUnstake}
          style={{ opacity: showUnstake ? '1' : '0' }}
        >
          Unstake
        </Button>
        <Button
          size="sm"
          color="primary"
          variant="outline"
          onClick={() => {
            setSelectedCandidate(row.original.candidate);
          }}
          disabled={!showStake}
        >
          Stake
        </Button>
      </div>
    );
  },
});
