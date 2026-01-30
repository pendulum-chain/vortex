import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FC } from "react";
import { create } from "zustand";
import { durations, easings } from "../../constants/animations";
import { cn } from "../../helpers/cn";

interface AccordionProps {
  children: React.ReactNode | React.ReactNode[];
  className?: string;
  defaultValue?: string[];
}

interface AccordionItemProps {
  children: React.ReactNode | React.ReactNode[];
  className?: string;
  value: string;
}

interface AccordionTriggerProps {
  children: React.ReactNode | React.ReactNode[];
  className?: string;
  value: string;
}

interface AccordionContentProps {
  children: React.ReactNode | React.ReactNode[];
  className?: string;
  value: string;
}

interface AccordionStore {
  value: string[];
  setValue: (value: string[]) => void;
  toggleValue: (itemValue: string) => void;
}

const useAccordionStore = create<AccordionStore>(set => ({
  setValue: value => set({ value }),
  toggleValue: itemValue =>
    set(state => ({
      value: state.value.includes(itemValue) ? state.value.filter(v => v !== itemValue) : [...state.value, itemValue]
    })),
  value: []
}));

const Accordion: FC<AccordionProps> = ({ children, className = "", defaultValue = [] }) => {
  const setValue = useAccordionStore(state => state.setValue);
  const shouldReduceMotion = useReducedMotion();

  if (defaultValue.length > 0) {
    setValue(defaultValue);
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("mx-auto w-full max-w-3xl", className)}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.slow, ease: easings.easeOutCubic }}
    >
      {children}
    </motion.div>
  );
};

const AccordionItem: FC<AccordionItemProps> = ({ children, className = "", value }) => {
  const isOpen = useAccordionStore(state => state.value.includes(value));
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={cn("border-gray-200 border-b last:border-b-0", className)}
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.slow }}
    >
      <div className="bg-white transition-colors duration-200 hover:bg-gray-50" data-state={isOpen ? "open" : "closed"}>
        {children}
      </div>
    </motion.div>
  );
};

const AccordionTrigger: FC<AccordionTriggerProps> = ({ children, className = "", value }) => {
  const toggleValue = useAccordionStore(state => state.toggleValue);
  const isOpen = useAccordionStore(state => state.value.includes(value));
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex">
      <motion.button
        className={cn(
          "w-full px-6 py-4 text-left font-medium text-base text-gray-900 cursor-pointer transition-colors duration-200 hover:text-blue-700 focus:outline-none md:text-lg",
          "w-full cursor-pointer px-6 py-4 text-left font-medium text-base text-gray-900 transition-all duration-200 hover:text-blue-700 focus:outline-none md:text-lg",
          className
        )}
        onClick={() => toggleValue(value)}
        whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
      >
        <div className="flex items-center justify-between">
          <span>{children}</span>
          <motion.svg
            animate={{ rotate: isOpen ? 180 : 0 }}
            className="h-5 w-5 text-blue-700"
            fill="none"
            stroke="currentColor"
            transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.slow, ease: easings.easeOutCubic }}
            viewBox="0 0 24 24"
          >
            <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          </motion.svg>
        </div>
      </motion.button>
    </div>
  );
};

const AccordionContent: FC<AccordionContentProps> = ({ children, className = "", value }) => {
  const isOpen = useAccordionStore(state => state.value.includes(value));
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out"
      style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className={cn("px-6 pb-6 text-gray-600 leading-relaxed", className)}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: durations.slow, ease: easings.easeOutCubic }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
