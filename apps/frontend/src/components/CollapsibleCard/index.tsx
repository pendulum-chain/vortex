import { AnimatePresence, motion } from "motion/react";
import { createContext, forwardRef, ReactNode, useContext, useId, useState } from "react";

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
          className={`rounded-lg border border-blue-700 bg-white p-4 shadow-md transition hover:scale-[101%] ${className}`}
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

  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className={`overflow-hidden ${className}`}
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <motion.div
            animate={{ y: 0 }}
            className="mt-4 border-gray-200 border-t pt-4"
            exit={{ y: -10 }}
            id={detailsId}
            initial={{ y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { CollapsibleCard, CollapsibleSummary, CollapsibleDetails, useCollapsibleCard };
