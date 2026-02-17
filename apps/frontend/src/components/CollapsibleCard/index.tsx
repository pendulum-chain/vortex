import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, forwardRef, ReactNode, useContext, useId, useState } from "react";
import { durations, easings } from "../../constants/animations";
import { cn } from "../../helpers/cn";

interface CollapsibleCardProps {
  children: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  onToggle?: (isExpanded: boolean) => void;
}

interface CollapsibleSummaryProps {
  children: ReactNode;
  className?: string;
}

interface CollapsibleDetailsProps {
  children: ReactNode;
  className?: string;
}

interface CollapsibleCardContextType {
  isExpanded: boolean;
  toggle: () => void;
  detailsId: string;
}

const CollapsibleCardContext = createContext<CollapsibleCardContextType | null>(null);

const useCollapsibleCard = () => {
  const context = useContext(CollapsibleCardContext);
  if (!context) {
    throw new Error("useCollapsibleCard must be used within a CollapsibleCard");
  }
  return context;
};

const CollapsibleCard = forwardRef<HTMLDivElement, CollapsibleCardProps>(
  ({ children, className = "", defaultExpanded = false, onToggle }, ref) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const detailsId = useId();

    const toggle = () => {
      const newState = !isExpanded;
      setIsExpanded(newState);
      onToggle?.(newState);
    };

    return (
      <CollapsibleCardContext.Provider value={{ detailsId, isExpanded, toggle }}>
        <div
          className={`flex flex-col-reverse rounded-lg border border-blue-700 bg-white p-4 shadow-md transition hover:scale-[101%] ${className}`}
          ref={ref}
        >
          {children}
        </div>
      </CollapsibleCardContext.Provider>
    );
  }
);

CollapsibleCard.displayName = "CollapsibleCard";

const CollapsibleSummary = ({ children, className = "" }: CollapsibleSummaryProps) => {
  return <div className={`flex items-center justify-between ${className}`}>{children}</div>;
};

const CollapsibleDetails = ({ children, className = "" }: CollapsibleDetailsProps) => {
  const { isExpanded, detailsId } = useCollapsibleCard();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "grid",
        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        "transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
        className
      )}
    >
      <div className="overflow-hidden">
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 border-gray-200 border-b pb-4"
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              id={detailsId}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.normal, ease: easings.easeOutCubic }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export { CollapsibleCard, CollapsibleSummary, CollapsibleDetails, useCollapsibleCard };
