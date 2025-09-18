import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";

interface ToggleButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  ariaLabel?: string;
  ariaControls?: string;
}

export const ToggleButton = ({
  isExpanded,
  onToggle,
  className = "",
  ariaLabel = "Toggle details",
  ariaControls
}: ToggleButtonProps) => {
  return (
    <button
      aria-controls={ariaControls}
      aria-expanded={isExpanded}
      aria-label={ariaLabel}
      className={`btn btn-sm h-8! rounded-full bg-blue-100 p-2 transition-colors hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${className}`}
      onClick={onToggle}
      type="button"
    >
      {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
    </button>
  );
};
