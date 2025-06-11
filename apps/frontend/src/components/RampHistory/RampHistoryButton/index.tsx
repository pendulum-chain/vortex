import { ClockIcon } from '@heroicons/react/24/outline';
import { useRampHistoryStore } from '../../../stores/rampHistoryStore';

export function RampHistoryButton() {
  const { isActive, actions } = useRampHistoryStore();

  return (
    <button
      className={`btn-vortex-accent px-3.5 py-1.5 cursor-pointer ${isActive ? 'bg-vortex-accent-hover' : ''}`}
      onClick={actions.toggleHistory}
    >
      <ClockIcon className="w-5 h-5" />
    </button>
  );
}
