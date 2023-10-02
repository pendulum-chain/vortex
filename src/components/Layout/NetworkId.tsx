import { FC, memo } from 'preact/compat';
import { useGlobalState } from '../../GlobalStateProvider';
import { useNodeInfoState } from '../../NodeInfoProvider';

const NetworkId: FC = memo(() => {
  const lastBlockNumber = useNodeInfoState().state.bestNumberFinalize;
  const { tenantRPC } = useGlobalState();
  const encodedRPC = tenantRPC ? encodeURI(tenantRPC) : '';

  return (
    <div className="pendulum-network-id">
      <span>Block No: </span>
      <svg height="5" width="5">
        <circle cx="2.5" cy="2.5" r="2.5" />
      </svg>
      <a
        href={`https://polkadot.js.org/apps/?rpc=${encodedRPC}#/explorer`}
        target="_blank"
        rel="noreferrer"
        title="Last block number"
      >
        {lastBlockNumber || '000000'}
      </a>
    </div>
  );
});

export default NetworkId;
