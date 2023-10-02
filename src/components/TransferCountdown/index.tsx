import { VoidFn } from '@polkadot/api-base/types';
import { SpacewalkPrimitivesIssueIssueRequest, SpacewalkPrimitivesRedeemRedeemRequest } from '@polkadot/types/lookup';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'preact/compat';
import { calculateDeadline } from '../../helpers/spacewalk';
import { useSecurityPallet } from '../../hooks/spacewalk/security';

interface TransferCountdownProps {
  request: SpacewalkPrimitivesIssueIssueRequest | SpacewalkPrimitivesRedeemRedeemRequest;
}

const TransferCountdown = ({ request }: TransferCountdownProps) => {
  const { subscribeActiveBlockNumber } = useSecurityPallet();
  const [activeBlockNumber, setActiveBlockNumber] = useState<number>(0);
  const [remainingDurationString, setRemainingDurationString] = useState<string>('');

  useEffect(() => {
    let unsub: VoidFn = () => undefined;
    subscribeActiveBlockNumber((blockNumber) => {
      setActiveBlockNumber(blockNumber);
    }).then((u) => (unsub = u));

    return unsub;
  }, [subscribeActiveBlockNumber]);

  const deadline = useMemo(() => {
    const openTime = request.opentime.toNumber() || 0;
    const period = request.period.toNumber() || 0;
    const end = calculateDeadline(activeBlockNumber, openTime, period, 12);

    return end;
  }, [activeBlockNumber, request]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newDeadlineString = deadline
        .diff(DateTime.now())
        .toFormat('hh:1mm:2ss:3')
        .replace(':1', 'h ')
        .replace(':2', 'm ')
        .replace(':3', 's ');
      setRemainingDurationString(newDeadlineString);
    });

    return () => clearInterval(interval);
  }, [deadline]);

  return <span className="transfer-timer">{remainingDurationString}</span>;
};

export default TransferCountdown;
