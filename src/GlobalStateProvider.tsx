import { ComponentChildren, createContext } from 'preact';
import { useCallback, useContext, useMemo } from 'preact/compat';
import { useLocation } from 'react-router-dom';
import { config } from './config';
import { TenantName } from './models/Tenant';
import { ThemeName } from './models/Theme';

export interface GlobalState {
  dAppName: string;
  tenantName: TenantName;
  tenantRPC?: string;
  getThemeName: () => ThemeName;
}

export const defaultTenant = TenantName.Pendulum;
const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

const GlobalStateProvider = ({ children }: { children: ComponentChildren }) => {
  const { pathname } = useLocation();
  const network = pathname.split('/').filter(Boolean)[0]?.toLowerCase();

  const tenantName = useMemo(() => {
    return network && Object.values<string>(TenantName).includes(network) ? (network as TenantName) : defaultTenant;
  }, [network]);

  const dAppName = tenantName;

  const getThemeName = useCallback(
    () => (tenantName ? config.tenants[tenantName]?.theme || ThemeName.Amplitude : ThemeName.Amplitude),
    [tenantName],
  );

  const providerValue = useMemo<GlobalState>(
    () => ({
      tenantName: tenantName,
      tenantRPC: config.tenants[tenantName].rpc,
      getThemeName,
      dAppName,
    }),
    [dAppName, getThemeName, tenantName],
  );

  return <GlobalStateContext.Provider value={providerValue}>{children}</GlobalStateContext.Provider>;
};

const useGlobalState = () => {
  const state = useContext(GlobalStateContext);
  if (!state) throw 'GlobalStateProvider not defined!';
  return state;
};

export { GlobalStateContext, GlobalStateProvider, useGlobalState };
