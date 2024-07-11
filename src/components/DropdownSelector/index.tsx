import { Dropdown } from 'react-daisyui';

interface Props<T> {
  items: T[];
  onChange: (item: T) => void;
  value?: T;
  children: JSX.Element;
}

export function DropdownSelector<T extends { id: unknown; displayName: string }>(props: Props<T>) {
  const { items, onChange, children } = props;
  return (
    <div className="flex flex-grow">
      <div className="dropdown min-w-[95px] flex justify-end">
        {children}
        <Dropdown.Menu className="w-52 z-50">
          {items.map((item) => (
            <Dropdown.Item
              key={item.id}
              onClick={() => {
                const elem = document.activeElement;
                if (elem && elem instanceof HTMLElement) {
                  elem?.blur();
                }
                onChange(item);
              }}
            >
              {item.displayName}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </div>
    </div>
  );
}
