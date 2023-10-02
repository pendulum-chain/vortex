import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalState } from '../GlobalStateProvider';
import { buildTenantPath } from '../helpers/url';
import { TenantName } from '../models/Tenant';

const useSwitchChain = () => {
  const { tenantName } = useGlobalState();
  const navigateTo = useNavigate();
  const location = useLocation().pathname;
  const switchChain = useCallback(
    (tenant: TenantName) => {
      navigateTo(buildTenantPath(tenantName, tenant, location));
      setTimeout(() => window.location.reload(), 50);
    },
    [location, navigateTo, tenantName],
  );
  return { switchChain, currentTenant: tenantName };
};
export default useSwitchChain;
