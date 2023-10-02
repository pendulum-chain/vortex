import { useGlobalState } from '../GlobalStateProvider';
import { Apps, appsConfigs } from '../config/apps';

export const useGetAppDataByTenant = <T extends Apps>(app: T) => {
  const tenantName = useGlobalState().tenantName;
  return { data: appsConfigs[app]?.[tenantName], tenantName };
};
