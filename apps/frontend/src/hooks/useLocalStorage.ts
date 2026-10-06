import { useCallback, useState } from "react";
import { storageService } from "../services/storage/local";

export enum LocalStorageKeys {
  RATING = "RATING",
  SELECTED_NETWORK = "SELECTED_NETWORK",
  TRIGGER_ACCOUNT_EVM = "TRIGGER_ACCOUNT_EVM",
  TRIGGER_ACCOUNT_POLKADOT = "TRIGGER_ACCOUNT_POLKADOT",
  SELECTED_POLKADOT_WALLET = "SELECTED_POLKADOT_WALLET",
  SELECTED_POLKADOT_ACCOUNT = "SELECTED_POLKADOT_ACCOUNT",
  FIRED_INITIALIZATION_EVENTS = "FIRED_INITIALIZATION_EVENTS",
  TERMS_AND_CONDITIONS = "TERMS_AND_CONDITIONS",
  RAMPING_STATE = "RAMPING_STATE",
  REGISTER_KEY_LOCAL_STORAGE = "rampRegisterKey",
  START_KEY_LOCAL_STORAGE = "rampStartKey"
}

type UseLocalStorageProps<T> = {
  /** Storage key */
  key: string;
} & (T extends undefined
  ? {
      /** Default/fallback value */
      defaultValue?: T;
    }
  : {
      /** Default/fallback value */
      defaultValue: T;
    });

export const useLocalStorage = <T extends string | undefined>({ key, defaultValue }: UseLocalStorageProps<T>) => {
  const [state, setState] = useState<T>(() => (storageService.get(key) as T) ?? (defaultValue as T));

  const set = useCallback(
    (value: T) => {
      storageService.set(key, value);
      setState(value);
    },
    [key]
  );

  const clear = useCallback(() => {
    storageService.remove(key);
    setState(defaultValue as T);
  }, [defaultValue, key]);

  return { clear, set, state };
};
