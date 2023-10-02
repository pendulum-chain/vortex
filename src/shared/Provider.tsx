import { ApiPromise } from '@polkadot/api';
import { ComponentChildren, createContext } from 'preact';
import { useContext, useMemo } from 'preact/compat';

export interface State {
  api?: ApiPromise;
  signer?: unknown; // TODO: fix type
  address?: string;
}

const SharedStateContext = createContext<State | undefined>(undefined);

export const SharedStateProvider = ({ children, api, signer, address }: { children: ComponentChildren } & State) => {
  const providerValue = useMemo<State>(
    () => ({
      api,
      signer,
      address,
    }),
    [api, signer, address],
  );
  return <SharedStateContext.Provider value={providerValue}>{children}</SharedStateContext.Provider>;
};

export const useSharedState = () => {
  const state = useContext(SharedStateContext);
  if (!state) throw 'SharedStateProvider not defined!';
  return state;
};
