import { ClockIcon } from '@heroicons/react/24/outline';
import { useRampHistoryStore } from '../../../stores/rampHistoryStore';

export function RampHistoryButton() {
  const { isActive, actions } = useRampHistoryStore();

  return (
    <button
      className={`btn-vortex-accent px-4 py-2 cursor-pointer ${isActive ? 'bg-vortex-accent-hover' : ''}`}
      onClick={actions.toggleHistory}
    >
      <ClockIcon className="w-4.5 h-4.5" />
    </button>
  );
}