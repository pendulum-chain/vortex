import { Outlet } from 'react-router-dom';
import { useGlobalState } from '../../GlobalStateProvider';
import { Apps, appsConfigs } from '../../config/apps';
import { TenantName } from '../../models/Tenant';
import Unsupported from './Unsupported';

export type AppsProviderProps = {
  app: Apps;
};

const AppsProvider = ({ app }: AppsProviderProps): JSX.Element | null => {
  const tenant = useGlobalState().tenantName;
  const supportedTenants = appsConfigs[app].tenants;
  if (!(supportedTenants as TenantName[]).includes(tenant)) {
    return <Unsupported app={app} tenant={tenant} supportedTenants={supportedTenants} />;
  }
  return <Outlet />;
};

AppsProvider.displayName = 'AppsProvider';

export default AppsProvider;
