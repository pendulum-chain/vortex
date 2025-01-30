import { createContext, ComponentChildren } from 'preact';
import { FC, useState, useContext } from 'preact/compat';

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
}

interface AccordionContentProps {
  children: ComponentChildren;
  className?: string;
}

const AccordionContext = createContext<{
  value: string[];
  onChange: (value: string) => void;
}>({ value: [], onChange: () => {} });

const Accordion: FC<AccordionProps> = ({ children, className = '', defaultValue }) => {
  const [value, setValue] = useState<string[]>(defaultValue ? [defaultValue] : []);

  const handleChange = (itemValue: string) => {
    setValue((prev) => {
      if (prev.includes(itemValue)) {
        return prev.filter((v) => v !== itemValue);
      }
      return [...prev, itemValue];
    });
  };

  return (
    <AccordionContext.Provider value={{ value, onChange: handleChange }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
};

const AccordionItem: FC<AccordionItemProps> = ({ children, className = '', value }) => {
  return (
    <div className={`border-b ${className}`}>
      <AccordionContext.Consumer>
        {(context) => <div data-state={context.value.includes(value) ? 'open' : 'closed'}>{children}</div>}
      </AccordionContext.Consumer>
    </div>
  );
};

const AccordionTrigger: FC<AccordionTriggerProps> = ({ children, className = '' }) => {
  const context = useContext(AccordionContext);
  const item = useContext(ItemContext);

  return (
    <div className="flex">
      <button
        onClick={() => context.onChange(item)}
        className={`flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-left ${className}`}
      >
        {children}
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
            context.value.includes(item) ? 'rotate-180' : ''
          }`}
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

const AccordionContent: FC<AccordionContentProps> = ({ children, className = '' }) => {
  const context = useContext(AccordionContext);
  const item = useContext(ItemContext);
  const isOpen = context.value.includes(item);

  return (
    <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
      <div className={`pb-4 pt-0 ${className}`}>{children}</div>
    </div>
  );
};

const ItemContext = createContext<string>('');

const AccordionItemProvider: FC<{ value: string; children: ComponentChildren }> = ({ value, children }) => (
  <ItemContext.Provider value={value}>{children}</ItemContext.Provider>
);

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent, AccordionItemProvider };
