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
  setValue: value => set({ value }),
  toggleValue: itemValue =>
    set(state => ({
      value: state.value.includes(itemValue) ? state.value.filter(v => v !== itemValue) : [...state.value, itemValue]
    })),
  value: []
}));

const Accordion: FC<AccordionProps> = ({ children, className = "", defaultValue = [] }) => {
  const setValue = useAccordionStore(state => state.setValue);

  if (defaultValue.length > 0) {
    setValue(defaultValue);
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("mx-auto w-full max-w-3xl", className)}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.div>
  );
};

const AccordionItem: FC<AccordionItemProps> = ({ children, className = "", value }) => {
  const isOpen = useAccordionStore(state => state.value.includes(value));

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={cn("border-gray-200 border-b last:border-b-0", className)}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="bg-white transition-colors duration-200 hover:bg-gray-50"
        data-state={isOpen ? "open" : "closed"}
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
        className={cn(
          "w-full px-6 py-4 text-left font-medium text-base text-gray-900 transition-all duration-200 hover:text-blue-700 focus:outline-none md:text-lg",
          className
        )}
        onClick={() => toggleValue(value)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center justify-between">
          <motion.span layout>{children}</motion.span>
          <motion.svg
            animate={{ rotate: isOpen ? 180 : 0 }}
            className="h-5 w-5 text-blue-700"
            fill="none"
            stroke="currentColor"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            viewBox="0 0 24 24"
          >
            <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
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
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <motion.div
            animate={{ y: 0 }}
            className={cn("px-6 pb-6 text-gray-600 leading-relaxed", className)}
            exit={{ y: -10 }}
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

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
