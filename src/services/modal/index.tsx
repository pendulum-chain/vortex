/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComponentChildren } from 'preact';
import { createContext, useCallback, useContext, useState } from 'preact/compat';

export type ModalState<T extends Dict<any> = Dict<any>> = {
  type?: number;
  props?: T;
};
export type ToggleModal<T extends Dict<any> = Dict<any>> = (type?: number | ModalState<T>) => void;

const ModalStateContext = createContext<ModalState | undefined>(undefined);
const ModalToggleContext = createContext<ToggleModal | undefined>(undefined);

export const useModalState = <T extends Dict<any>>(): ModalState<T> => {
  return useContext(ModalStateContext) as ModalState<T>;
};
export const useModalToggle = <T extends Dict<any>>(): ToggleModal<T> => {
  return useContext(ModalToggleContext) as ToggleModal<T>;
};
export const useModal = <T extends Dict<any>>(): [ModalState<T>, ToggleModal<T>] => [useModalState(), useModalToggle()];

export interface ModalProviderProps {
  children: ComponentChildren;
}
const ModalProvider = ({ children }: ModalProviderProps): JSX.Element | null => {
  const [state, setModalState] = useState<ModalState>({});

  const toggleModal: ToggleModal = useCallback((type = {}) => {
    if (typeof type === 'number') setModalState({ type });
    else setModalState(type);
  }, []);

  return (
    <ModalStateContext.Provider value={state}>
      <ModalToggleContext.Provider value={toggleModal}>{children}</ModalToggleContext.Provider>
    </ModalStateContext.Provider>
  );
};

export default ModalProvider;
