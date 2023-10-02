import { CSSProperties, ChangeEvent } from 'preact/compat';
import { Select } from 'react-daisyui';
import { ofSelect } from '../../helpers/general';

interface Item {
  id: object | string;
  displayName: string;
}

interface Props<T> {
  items: T[];
  label?: string;
  onChange: (item: T) => void;
  value?: T;
  style?: CSSProperties;
  selectStyle?: CSSProperties;
}

function LabelledSelector<T extends Item>(props: Props<T>) {
  const { label, items, onChange, value } = props;

  return (
    <div className="form-control" style={props.style}>
      {label && (
        <label className="label">
          <span className="label-text">{label}</span>
        </label>
      )}
      <Select
        className="w-fit max-w-full h-10 border border-neutral-500 rounded-md bg-transparent"
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          if (!ofSelect(e.target)) return;
          const id = e.target?.value;
          const item = items.find((i) => i.id.toString() === id.toString());
          if (item) {
            onChange(item);
          }
        }}
        style={props.selectStyle}
        value={value?.id}
      >
        {items.map((item) => (
          <option key={item.id} value={item.id.toString()} className="bg-base-200">
            {item.displayName}
          </option>
        ))}
      </Select>
    </div>
  );
}

export default LabelledSelector;
