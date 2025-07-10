import { useCallback, useEffect, useState } from "react";
import { storageKeys } from "../../constants/localStorage";
import { usePixId, useRampFormStoreActions } from "../../stores/ramp/useRampFormStore";

export const useBrlaKycPixKeyLocalStorage = () => {
  const storePixId = usePixId();

  const { setPixId: setStorePixId } = useRampFormStoreActions();

  const [localStoragePixId, setLocalStoragePixId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(storageKeys.BRLA_KYC_PIX_KEY) || undefined;
    } catch (error) {
      console.error("Error loading pixId from localStorage:", error);
      return undefined;
    }
  });

  useEffect(() => {
    if (storePixId) {
      localStorage.setItem(storageKeys.BRLA_KYC_PIX_KEY, storePixId);
    }
  }, [storePixId]);

  const setPixId = useCallback(
    (newPixId: string | undefined) => {
      setLocalStoragePixId(newPixId);
      if (newPixId) {
        setStorePixId(newPixId);
      }
    },
    [setStorePixId]
  );

  const clearPixId = () => {
    localStorage.removeItem(storageKeys.BRLA_KYC_PIX_KEY);
  };

  const finalPixId = storePixId || localStoragePixId;

  return { clearPixId, pixId: finalPixId, setPixId };
};
