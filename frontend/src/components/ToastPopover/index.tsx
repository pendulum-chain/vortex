import { toast, ToastContainer, ToastContainerProps, ToastItem } from 'react-toastify';
import { useEffect, useState } from 'react';
import { Popover } from '../Popover';

export function useHasActiveToasts() {
  const [activeToasts, setActiveToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    const unsubscribe = toast.onChange((payload: ToastItem) => {
      if (payload.status === 'added') {
        setActiveToasts((prev) => [...prev, payload]);
      }
      if (payload.status === 'removed') {
        setActiveToasts((prev) => prev.filter((t) => t.id !== payload.id));
      }
    });
    return () => unsubscribe();
  }, []);

  return activeToasts.length > 0;
}

export const ToastPopover = (props: ToastContainerProps) => {
  const hasActiveToasts = useHasActiveToasts();
  return (
    <Popover isVisible={hasActiveToasts}>
      <ToastContainer {...props} />
    </Popover>
  );
};
