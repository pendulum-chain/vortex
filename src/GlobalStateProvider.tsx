import { getWalletBySource, WalletAccount } from '@talismn/connect-wallets';
import { getSdkError } from '@walletconnect/utils';
import { ComponentChildren, createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/compat';
import { useLocation } from 'react-router-dom';
import { config } from './config';
import { chainIds } from './config/walletConnect';

import { useLocalStorage } from './hooks/useLocalStorage';
import { TenantName } from './models/Tenant';
import { ThemeName } from './models/Theme';
import { initiateMetamaskInjectedAccount, WALLET_SOURCE_METAMASK } from './services/metamask';
import { storageService } from './services/storage/local';
import { walletConnectService } from './services/walletConnect';

export interface GlobalState {
  dAppName: string;
  tenantName: TenantName;
  tenantRPC?: string;
  getThemeName: () => ThemeName;
}

export const defaultTenant = TenantName.Pendulum;
const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

const GlobalStateProvider = ({ children }: { children: ComponentChildren }) => {
  const [walletAccount, setWallet] = useState<WalletAccount | undefined>(undefined);
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
