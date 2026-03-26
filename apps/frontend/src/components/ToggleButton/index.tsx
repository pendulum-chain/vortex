import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";
import { cn } from "../../helpers/cn";

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
      className={cn(
        "btn btn-sm h-8! rounded-full bg-primary/10 p-2 transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
      onClick={onToggle}
      type="button"
    >
      {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronUpIcon className="h-4 w-4" />}
    </button>
  );
};
