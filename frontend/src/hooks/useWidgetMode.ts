import { useMemo } from 'react';

export const useWidgetMode = (): boolean => {
  const isWidgetMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'widget';
  }, []);

  return isWidgetMode;
};
