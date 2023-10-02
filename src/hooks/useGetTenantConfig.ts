import { useGlobalState } from '../GlobalStateProvider';
import { config } from '../config';

export const useGetTenantConfig = () => {
  const tenantName = useGlobalState().tenantName;
  return config.tenants[tenantName];
};
