/* eslint-disable @typescript-eslint/no-unused-vars */
import { FC, memo } from 'preact/compat';
import { useNodeInfoState } from '../../NodeInfoProvider';
import { TenantName } from '../../models/Tenant';

interface Props {
  tenantName: TenantName | undefined;
}

const Versions: FC<Props> = memo(({ tenantName }: Props) => {
  const { state } = useNodeInfoState();
  let indicator = '';

  switch (tenantName) {
    case 'amplitude': {
      indicator = 'alpha';
      break;
    }
    case 'pendulum': {
      indicator = '';
      break;
    }
    case 'foucoco': {
      indicator = 'Foucoco';
      break;
    }
  }

  return (
    <div className="pendulum-versions">
      <p>
        <span className="text-green-300 hover:text-green-500 cursor-default mr-1">{indicator}</span>
        Runtime: {(state.nodeVersion && state.nodeVersion.toString()) || '0.0.0-00000000000'}
      </p>
    </div>
  );
});

export default Versions;
