import { AnimatePresence, motion } from "motion/react";
import { FC } from "react";
import { create } from "zustand";
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
  value: [],
  setValue: value => set({ value }),
  toggleValue: itemValue =>
    set(state => ({
      value: state.value.includes(itemValue) ? state.value.filter(v => v !== itemValue) : [...state.value, itemValue]
    }))
}));

const Accordion: FC<AccordionProps> = ({ children, className = "", defaultValue = [] }) => {
  const setValue = useAccordionStore(state => state.setValue);

  if (defaultValue.length > 0) {
    setValue(defaultValue);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn("mx-auto w-full max-w-3xl", className)}
    >
      {children}
    </motion.div>
  );
};

const AccordionItem: FC<AccordionItemProps> = ({ children, className = "", value }) => {
  const isOpen = useAccordionStore(state => state.value.includes(value));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn("border-gray-200 border-b last:border-b-0", className)}
    >
      <motion.div
        data-state={isOpen ? "open" : "closed"}
        className="bg-white transition-colors duration-200 hover:bg-gray-50"
        layout
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

const AccordionTrigger: FC<AccordionTriggerProps> = ({ children, className = "", value }) => {
  const toggleValue = useAccordionStore(state => state.toggleValue);
  const isOpen = useAccordionStore(state => state.value.includes(value));

  return (
    <motion.div className="flex" layout>
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => toggleValue(value)}
        className={cn(
          "w-full px-6 py-4 text-left font-medium text-base text-gray-900 transition-all duration-200 hover:text-blue-700 focus:outline-none md:text-lg",
          className
        )}
      >
        <div className="flex items-center justify-between">
          <motion.span layout>{children}</motion.span>
          <motion.svg
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="h-5 w-5 text-blue-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </motion.button>
    </motion.div>
  );
};

const AccordionContent: FC<AccordionContentProps> = ({ children, className = "", value }) => {
  const isOpen = useAccordionStore(state => state.value.includes(value));

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <motion.div
            initial={{ y: -10 }}
            animate={{ y: 0 }}
            exit={{ y: -10 }}
            transition={{ duration: 0.3 }}
            className={cn("px-6 pb-6 text-gray-600 leading-relaxed", className)}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
