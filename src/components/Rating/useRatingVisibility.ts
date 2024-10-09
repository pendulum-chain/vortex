import { useEffect, useState } from 'preact/hooks';
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
    const now = new Date();

    if (now.getTime() - Number(timestamp) < FIFTEEN_DAYS_MS) {
      setIsVisible(false);
    } else {
      clear();
      setIsVisible(true);
    }
  }, [clear, timestamp]);

  return {
    isVisible,
    setIsVisible,
    setTimestamp,
  };
}
