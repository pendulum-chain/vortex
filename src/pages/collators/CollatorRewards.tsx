import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'react-daisyui';
import { toast } from 'react-toastify';
import { useGlobalState } from '../../GlobalStateProvider';
import { useNodeInfoState } from '../../NodeInfoProvider';
import RewardsIcon from '../../assets/collators-rewards-icon';
import StakedIcon from '../../assets/collators-staked-icon';
import { getAddressForFormat } from '../../helpers/addressFormatter';
import { getErrors } from '../../helpers/substrate';
import { useStakingPallet } from '../../hooks/staking/staking';
import { nativeToFormat } from '../../shared/parseNumbers';
import { UserStaking } from './columns';
import ClaimRewardsDialog from './dialogs/ClaimRewardsDialog';

function CollatorRewards() {
  const [userAvailableBalance, setUserAvailableBalance] = useState<string>('0.00');
  const [userStaking, setUserStaking] = useState<UserStaking>();
  const [claimDialogOpen, setClaimDialogOpen] = useState<boolean>(false);
  const [submissionPending, setSubmissionPending] = useState(false);
  const [unstaking, setUnstaking] = useState<string>('0.00');

  const { api, tokenSymbol, ss58Format } = useNodeInfoState().state;
  const { walletAccount } = useGlobalState();
  const { candidates, estimatedRewards, refreshRewards, createUpdateDelegatorRewardsExtrinsic } = useStakingPallet();

  const userAccountAddress = useMemo(() => {
    return walletAccount && ss58Format ? getAddressForFormat(walletAccount?.address, ss58Format) : '';
  }, [walletAccount, ss58Format]);

  useMemo(() => {
    setUserStaking(undefined);
    return candidates?.forEach((candidate) => {
      const isDelegator = candidate.delegators.find((delegator) => delegator.owner === userAccountAddress);
      if (isDelegator) {
        setUserStaking({
          candidateId: candidate.id,
          amount: isDelegator.amount,
        });
      }
    });
  }, [candidates, userAccountAddress, setUserStaking]);

  useEffect(() => {
    const fetchAvailableBalance = async () => {
      if (!api || !walletAccount) {
        return '0';
      }
      const { data: balance } = await api.query.system.account(walletAccount?.address);
      setUserAvailableBalance(balance.free.sub(balance.miscFrozen).toString());
    };
    const fetchUnstaking = async () => {
      if (!api || !walletAccount) {
        return '0.00';
      }
      const unstakingData = await api.query.parachainStaking.unstaking(walletAccount?.address);
      unstakingData.forEach((n) => setUnstaking(nativeToFormat(parseInt(n.toString()), tokenSymbol)));
    };

    fetchUnstaking();
    fetchAvailableBalance();
  }, [api, tokenSymbol, walletAccount]);

  const updateRewardsExtrinsic = useMemo(() => {
    if (!api) {
      return undefined;
    }

    return createUpdateDelegatorRewardsExtrinsic();
  }, [api, createUpdateDelegatorRewardsExtrinsic]);

  const submitUpdateExtrinsic = useCallback(() => {
    if (!updateRewardsExtrinsic || !api || !walletAccount) {
      return;
    }
    setSubmissionPending(true);
    updateRewardsExtrinsic
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .signAndSend(walletAccount.address, { signer: walletAccount.signer as any }, (result) => {
        const { status, events } = result;
        const errors = getErrors(events, api);
        if (status.isInBlock) {
          if (errors.length > 0) {
            const errorMessage = `Transaction failed with errors: ${errors.join('\n')}`;
            console.error(errorMessage);
            toast(errorMessage, { type: 'error' });
          }
        } else if (status.isFinalized) {
          setSubmissionPending(false);
          refreshRewards();
          if (errors.length === 0) {
            toast('Delegator rewards updated', { type: 'success' });
          }
        }
      })
      .catch((error) => {
        toast('Transaction submission failed: ' + error.toString(), {
          type: 'error',
        });
        setSubmissionPending(false);
      });
  }, [api, refreshRewards, updateRewardsExtrinsic, walletAccount]);

  return (
    <>
      <div className="flex mb-8 justify-between">
        <div className="card gap-0 rounded-lg bg-base-200 sm:w-1/2 collators-box">
          <div className="card-body">
            <h2 className="card-title">Staking</h2>
            <div className="flex flex-row flex-wrap gap-4">
              <div className="flex-initial">
                <StakedIcon />
              </div>
              <div className="flex-auto">
                <h3>{nativeToFormat(userStaking?.amount || '0.00', tokenSymbol)}</h3>
                <p>My Staking</p>
              </div>
              <div className="flex-auto">
                <h3>{nativeToFormat(userAvailableBalance, tokenSymbol)}</h3>
                <p>Free balance</p>
              </div>
              <div className="flex flex-auto place-content-end">
                <button className="btn btn-secondary w-full" disabled>
                  {unstaking} unstaking
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="card rounded-lg bg-base-200 w-1/2 ml-4 collators-box">
          <div className="card-body">
            <h2 className="card-title">Staking Rewards</h2>
            <div className="flex flex-row">
              <div className="flex-initial pt-1 pr-5 pb-0">
                <RewardsIcon />
              </div>
              <div className="flex-auto">
                <h4>{nativeToFormat(estimatedRewards, tokenSymbol)}</h4>
                <p>Estimated reward</p>
              </div>
              <div className="flex flex-auto place-content-end">
                <Button
                  loading={submissionPending}
                  onClick={() => submitUpdateExtrinsic()}
                  className="btn btn-primary btn-outline w-1/3 mr-2"
                  disabled={!walletAccount}
                >
                  Update
                </Button>
                <Button
                  onClick={() => setClaimDialogOpen(true)}
                  className="btn btn-primary w-1/3"
                  disabled={!walletAccount || parseFloat(estimatedRewards) <= 0}
                >
                  Claim
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ClaimRewardsDialog
        userRewardsBalance={estimatedRewards}
        tokenSymbol={tokenSymbol}
        visible={claimDialogOpen}
        onClose={() => setClaimDialogOpen(false)}
      />
    </>
  );
}

export default CollatorRewards;
