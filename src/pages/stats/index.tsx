import { useEffect, useState } from 'preact/compat';
import { useGlobalState } from '../../GlobalStateProvider';
import { useNodeInfoState } from '../../NodeInfoProvider';
import { StatsData, getStatsData } from '../../services/stats';

export function Stats(): JSX.Element {
  const [data, setData] = useState<StatsData | undefined>(undefined);
  const { tokenSymbol } = useNodeInfoState().state;
  const { tenantRPC } = useGlobalState();
  useEffect(() => {
    getStatsData(tenantRPC).then((d) => setData(d));
  }, [setData, tenantRPC]);

  return data ? (
    <div className="rounded bg-base-200 p-10 mt-5 border border-slate-200 w-fit">
      <h1 className="text-3xl mb-2">Stats</h1>
      <div className="text-xl">{`Total issuance: ${data?.totalIssuance} ${tokenSymbol}`}</div>
      <div className="text-xl">{`Total transferable (in circulation): ${data.totalTransferable} ${tokenSymbol}`}</div>
      <div className="text-xl">{`Total locked: ${data?.totalLocked} ${tokenSymbol}`}</div>
      <div className="text-xl">{`Total reserved: ${data?.totalReserved} ${tokenSymbol}`}</div>
    </div>
  ) : (
    <></>
  );
}
