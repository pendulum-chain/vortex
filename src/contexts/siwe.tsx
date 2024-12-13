import { useSiweSignature } from '../hooks/useSignChallenge';
import { createContext } from 'preact';
import { PropsWithChildren, useContext } from 'preact/compat';

type UseSiweContext = ReturnType<typeof useSiweSignature>;
const SiweContext = createContext<UseSiweContext | undefined>(undefined);

export const useSiweContext = () => {
  const contextValue = useContext(SiweContext);
  if (contextValue === undefined) {
    throw new Error('Context must be inside a Provider');
  }

  return contextValue;
};

export const SiweProvider = ({ children }: PropsWithChildren) => {
  const { address } = useVortexAccount();
  const siweSignature = useSiweSignature(address);

  return <SiweContext.Provider value={siweSignature}>{children}</SiweContext.Provider>;
};
