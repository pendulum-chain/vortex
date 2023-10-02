import { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import { Option } from '@polkadot/types-codec';
import Big from 'big.js';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useGlobalState } from '../../GlobalStateProvider';
import { useNodeInfoState } from '../../NodeInfoProvider';
import { getAddressForFormat } from '../../helpers/addressFormatter';

interface ParachainStakingDelegator {
  owner: string;
  amount: string;
}

export interface ParachainStakingCandidate {
  id: string;
  stake: string;
  delegators: ParachainStakingDelegator[];
  total: string;
  status: string | false;
}

export interface ParachainStakingInflationInflationInfo {
  collator: {
    maxRate: string;
    rewardRate: {
      annual: string;
      perBlock: string;
    };
  };
  delegator: {
    maxRate: string;
    rewardRate: {
      annual: string;
      perBlock: string;
    };
  };
}

const defaultTransactionFees = {
  joinDelegators: Big(0),
  delegatorStakeMore: Big(0),
  delegatorStakeLess: Big(0),
  leaveDelegators: Big(0),
};

type ParachainStakingFees = typeof defaultTransactionFees;

export function useStakingPallet() {
  const { api } = useNodeInfoState().state;
  const { walletAccount } = useGlobalState();
  const { ss58Format } = useNodeInfoState().state;

  const [candidates, setCandidates] = useState<ParachainStakingCandidate[]>();
  const [inflationInfo, setInflationInfo] = useState<ParachainStakingInflationInflationInfo | undefined>(undefined);
  const [minDelegatorStake, setMinDelegatorStake] = useState<string>('0');
  const [estimatedRewards, setEstimatedRewards] = useState<string>('0');
  const [fees, setFees] = useState<ParachainStakingFees>(defaultTransactionFees);

  const fetchEstimatedReward = useCallback(async () => {
    if (!api || !walletAccount?.address) return '0';
    const formattedAddr = ss58Format ? getAddressForFormat(walletAccount.address, ss58Format) : walletAccount.address;
    return (await api.query.parachainStaking.rewards(formattedAddr)).toString();
  }, [api, ss58Format, walletAccount?.address]);

  useEffect(() => {
    if (!api) {
      return;
    }

    // Check that the pallet is available
    if (!api.query.parachainStaking) {
      return;
    }

    const fetchCandidatePool = async () => {
      const entries = await api.query.parachainStaking.candidatePool.entries();

      const newCandidates = entries.map(([_, value]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const candidate = (value as Option<any>).unwrap().toHuman() as ParachainStakingCandidate;

        return candidate;
      });

      return newCandidates;
    };

    const fetchInflationInfo = async () => {
      const inflationInfo = await api.query.parachainStaking.inflationConfig();
      return inflationInfo.toHuman() as unknown as ParachainStakingInflationInflationInfo;
    };

    const fetchFees = async () => {
      const dummyAddress = '5D4tzEZy9XeNSwsAXgtZrRrs1bTfpPTWGqwb1PwCYjRTKYYS';
      const sender = dummyAddress;
      const pallet = api.tx.parachainStaking;

      const jdi = await pallet.joinDelegators(dummyAddress, '0').paymentInfo(sender);
      const dsmi = await pallet.delegatorStakeMore(dummyAddress, '0').paymentInfo(sender);
      const dsli = await pallet.delegatorStakeLess(dummyAddress, '0').paymentInfo(sender);
      const lds = await pallet.leaveDelegators().paymentInfo(sender);

      fees.joinDelegators = new Big(jdi.partialFee.toString());
      fees.delegatorStakeMore = new Big(dsmi.partialFee.toString());
      fees.delegatorStakeLess = new Big(dsli.partialFee.toString());
      fees.leaveDelegators = new Big(lds.partialFee.toString());

      return fees;
    };

    fetchCandidatePool().then((candidates) => setCandidates(candidates));

    fetchEstimatedReward().then((reward) => setEstimatedRewards(reward));

    fetchInflationInfo().then((inflationInfo) => setInflationInfo(inflationInfo));

    fetchFees().then((newFees) => setFees(newFees));

    if (api.consts.parachainStaking?.minDelegatorStake) {
      setMinDelegatorStake((api.consts.parachainStaking.minDelegatorStake.toHuman() as string) || '0');
    }
  }, [api, walletAccount, walletAccount?.address, fees, ss58Format, fetchEstimatedReward]);

  const memo = useMemo(() => {
    return {
      candidates,
      inflationInfo,
      minDelegatorStake,
      estimatedRewards,
      fees,
      refreshRewards() {
        fetchEstimatedReward().then((reward) => setEstimatedRewards(reward));
      },
      async getTransactionFee(extrinsic: SubmittableExtrinsic) {
        if (!api || !extrinsic.hasPaymentInfo) {
          return new Big(0);
        }

        // Can be any address because we don't care about executing it here
        const dummyAddress = '5D4tzEZy9XeNSwsAXgtZrRrs1bTfpPTWGqwb1PwCYjRTKYYS';
        const sender = dummyAddress;
        const info = await extrinsic.paymentInfo(sender);

        return new Big(info.partialFee.toString());
      },
      createClaimRewardExtrinsic(_claimAmount: string) {
        if (!api) {
          return undefined;
        }
        return api.tx.parachainStaking?.claimRewards();
      },
      createDelegateMoreExtrinsic(collatorAddress: string, moreAmountNative: string) {
        if (!api) {
          return undefined;
        }

        return api.tx.parachainStaking?.delegatorStakeMore(collatorAddress, moreAmountNative);
      },
      createDelegateLessExtrinsic(collatorAddress: string, lessAmountNative: string) {
        if (!api) {
          return undefined;
        }

        return api.tx.parachainStaking?.delegatorStakeLess(collatorAddress, lessAmountNative);
      },
      createJoinDelegatorsExtrinsic(collatorAddress: string, amountNative: string) {
        if (!api) {
          return undefined;
        }

        return api.tx.parachainStaking?.joinDelegators(collatorAddress, amountNative);
      },
      createLeaveDelegatorsExtrinsic() {
        if (!api) {
          return undefined;
        }

        return api.tx.parachainStaking.leaveDelegators();
      },
      createUpdateDelegatorRewardsExtrinsic() {
        if (!api) {
          return undefined;
        }
        const txs = [
          api.tx.parachainStaking?.incrementDelegatorRewards(),
          api.tx.parachainStaking?.incrementCollatorRewards(),
        ];
        return api.tx.utility.batch(txs);
      },
    };
  }, [candidates, inflationInfo, minDelegatorStake, estimatedRewards, fees, fetchEstimatedReward, api]);

  return memo;
}
