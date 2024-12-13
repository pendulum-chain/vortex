import { createContext } from 'preact';
import { PropsWithChildren, useContext } from 'preact/compat';
import { useVortexAccount } from '../hooks/useVortexAccount';
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
  const { address } = useVortexAccount();
  console.log('SiweProvider: address is: ', address);
  const siweSignature = useSiweSignature(address);

  return <SiweContext.Provider value={siweSignature}>{children}</SiweContext.Provider>;
};
