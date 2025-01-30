import { ComponentChildren } from 'preact';
import { FC } from 'preact/compat';
import { create } from 'zustand';

interface AccordionProps {
  children: ComponentChildren;
  className?: string;
  defaultValue?: string[];
}

interface AccordionItemProps {
  children: ComponentChildren;
  className?: string;
  value: string;
}

interface AccordionTriggerProps {
  children: ComponentChildren;
  className?: string;
  value: string;
}

interface AccordionContentProps {
  children: ComponentChildren;
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

  return <div className={className}>{children}</div>;
};

const AccordionItem: FC<AccordionItemProps> = ({ children, className = '', value }) => {
  const isOpen = useAccordionStore((state) => state.value.includes(value));

  return (
    <div className={`border-b ${className}`}>
      <div data-state={isOpen ? 'open' : 'closed'}>{children}</div>
    </div>
  );
};

const AccordionTrigger: FC<AccordionTriggerProps> = ({ children, className = '', value }) => {
  const toggleValue = useAccordionStore((state) => state.toggleValue);
  const isOpen = useAccordionStore((state) => state.value.includes(value));

  return (
    <div className="flex">
      <button
        onClick={() => toggleValue(value)}
        className={`flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-left ${className}`}
      >
        {children}
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
};

const AccordionContent: FC<AccordionContentProps> = ({ children, className = '', value }) => {
  const isOpen = useAccordionStore((state) => state.value.includes(value));

  return (
    <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
      <div className={`pb-4 pt-0 ${className}`}>{children}</div>
    </div>
  );
};

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
