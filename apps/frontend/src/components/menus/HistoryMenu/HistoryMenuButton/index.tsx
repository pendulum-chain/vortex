import { ClockIcon } from "@heroicons/react/24/outline";
import { useSelector } from "@xstate/react";
import { useRampActor } from "../../../../contexts/rampState";
import { useRampHistoryStore } from "../../../../stores/rampHistoryStore";

export function HistoryMenuButton() {
  const rampActor = useRampActor();
  const { isActive, actions } = useRampHistoryStore();
  const isAuthenticated = useSelector(rampActor, state => state.context.isAuthenticated);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <button
        className={`btn-vortex-accent cursor-pointer px-3.5 py-1.5 transition-transform duration-200 active:scale-95 ${isActive ? "bg-vortex-accent-hover" : ""}`}
        onClick={actions.toggleHistory}
        type="button"
      >
        <ClockIcon className="h-5 w-5" />
      </button>
    </>
  );
}
