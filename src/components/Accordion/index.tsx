import { FC } from 'react';
import { create } from 'zustand';
import { motion, AnimatePresence } from 'motion/react';

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

const useAccordionStore = create<AccordionStore>((set) => ({
  value: [],
  setValue: (value) => set({ value }),
  toggleValue: (itemValue) =>
    set((state) => ({
      value: state.value.includes(itemValue) ? state.value.filter((v) => v !== itemValue) : [...state.value, itemValue],
    })),
}));

const Accordion: FC<AccordionProps> = ({ children, className = '', defaultValue = [] }) => {
  const setValue = useAccordionStore((state) => state.setValue);

  if (defaultValue.length > 0) {
    setValue(defaultValue);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`w-full max-w-3xl mx-auto ${className}`}
    >
      {children}
    </motion.div>
  );
};

const AccordionItem: FC<AccordionItemProps> = ({ children, className = '', value }) => {
  const isOpen = useAccordionStore((state) => state.value.includes(value));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`border-b border-gray-200 last:border-b-0 ${className}`}
    >
      <motion.div
        data-state={isOpen ? 'open' : 'closed'}
        className="transition-colors duration-200 bg-white hover:bg-gray-50"
        layout
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

const AccordionTrigger: FC<AccordionTriggerProps> = ({ children, className = '', value }) => {
  const toggleValue = useAccordionStore((state) => state.toggleValue);
  const isOpen = useAccordionStore((state) => state.value.includes(value));

  return (
    <motion.div className="flex" layout>
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => toggleValue(value)}
        className={`w-full text-left px-6 py-4 text-base md:text-lg font-medium text-gray-900 hover:text-blue-700 focus:outline-none transition-all duration-200 ${className}`}
      >
        <div className="flex items-center justify-between">
          <motion.span layout>{children}</motion.span>
          <motion.svg
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={`h-5 w-5 text-blue-700`}
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

const AccordionContent: FC<AccordionContentProps> = ({ children, className = '', value }) => {
  const isOpen = useAccordionStore((state) => state.value.includes(value));

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <motion.div
            initial={{ y: -10 }}
            animate={{ y: 0 }}
            exit={{ y: -10 }}
            transition={{ duration: 0.3 }}
            className={`px-6 pb-6 text-gray-600 leading-relaxed ${className}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
