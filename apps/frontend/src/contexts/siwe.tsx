import { createContext } from 'react';
import { PropsWithChildren, useContext } from 'react';
import { useSiweSignature } from '../hooks/useSignChallenge';

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
  const siweSignature = useSiweSignature();

  return <SiweContext.Provider value={siweSignature}>{children}</SiweContext.Provider>;
};
