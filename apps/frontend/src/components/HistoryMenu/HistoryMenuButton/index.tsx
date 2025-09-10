import { ClockIcon } from "@heroicons/react/24/outline";
import { useRampHistoryStore } from "../../../stores/rampHistoryStore";
import { HistoryMenu } from "..";

export function HistoryMenuButton() {
  const { isActive, actions } = useRampHistoryStore();

  return (
    <>
      <HistoryMenu />
      <button
        className={`btn-vortex-accent cursor-pointer px-3.5 py-1.5 ${isActive ? "bg-vortex-accent-hover" : ""}`}
        onClick={actions.toggleHistory}
      >
        <ClockIcon className="h-5 w-5" />
      </button>
    </>
  );
}
