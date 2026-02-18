import { useSyncExternalStore } from "react";
import { ToastContainer, ToastContainerProps, ToastItem, toast } from "react-toastify";
import { Popover } from "../Popover";

const activeToastIds = new Set<ToastItem["id"]>();

function subscribe(callback: () => void) {
  return toast.onChange((payload: ToastItem) => {
    if (payload.status === "added" && !activeToastIds.has(payload.id)) {
      activeToastIds.add(payload.id);
      callback();
    }
    if (payload.status === "removed" && activeToastIds.has(payload.id)) {
      activeToastIds.delete(payload.id);
      callback();
    }
  });
}

function getSnapshot() {
  return activeToastIds.size;
}

export function useHasActiveToasts() {
  return useSyncExternalStore(subscribe, getSnapshot) > 0;
}

export const ToastPopover = (props: ToastContainerProps) => {
  const hasActiveToasts = useHasActiveToasts();
  return (
    <Popover isVisible={hasActiveToasts}>
      <ToastContainer {...props} />
    </Popover>
  );
};
