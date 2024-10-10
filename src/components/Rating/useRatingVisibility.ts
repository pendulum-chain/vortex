import { useCallback, useEffect, useState } from 'preact/hooks';
import { useLocalStorage, LocalStorageKeys } from '../../hooks/useLocalStorage';

export function useRatingVisibility() {
  const {
    set: setTimestamp,
    state: timestamp,
    clear,
  } = useLocalStorage<string | undefined>({
    key: LocalStorageKeys.RATING,
  });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
    const now = new Date().getTime();
    const lastRatingTimestamp = Number(timestamp);

    if (now - lastRatingTimestamp < FIFTEEN_DAYS_MS) {
      setIsVisible(false);
    } else {
      clear();
      setIsVisible(true);
    }
  }, [clear, timestamp]);

  const onClose = useCallback(() => {
    setIsVisible(false);
    setTimestamp(Date.now().toString());
  }, [setIsVisible, setTimestamp]);

  return {
    isVisible,
    onClose,
  };
}
