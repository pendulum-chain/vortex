import { Button, Dropdown } from 'react-daisyui';

function ArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: 20,
        height: 20,
        marginLeft: 10,
        maxWidth: 15,
      }}
      viewBox="0 0 448 512"
    >
      <path
        className="fill-gray-400"
        d="M224 416c-8.188 0-16.38-3.125-22.62-9.375l-192-192c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L224 338.8l169.4-169.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-192 192C240.4 412.9 232.2 416 224 416z"
      />
    </svg>
  );
}

interface Props<T> {
  items: T[];
  onChange: (item: T) => void;
  value?: T;
}

function DropdownSelector<T extends { id: unknown; displayName: string }>(props: Props<T>) {
  const { items, onChange, value } = props;

  return (
    <div>
      <div className="row-pick-coin">
        <Dropdown>
          <Dropdown.Toggle>
            <Button animation={false} endIcon={<ArrowIcon />}>
              <span className="normal-case">{value?.displayName}</span>
            </Button>
          </Dropdown.Toggle>
          <Dropdown.Menu className="w-52">
            {items.map((item) => (
              <Dropdown.Item key={item.id} onClick={() => onChange(item)}>
                {item.displayName}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        <div className="h-10" />
      </div>
    </div>
  );
}

export default DropdownSelector;
