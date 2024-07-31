import { Input } from 'react-daisyui';
import { ChangeEvent, useState } from 'preact/compat';
import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';
import { Dialog } from '../Dialog';
import { Skeleton } from '../Skeleton';
import { PoolListItem } from './PoolListItem';

interface PoolSelectorModalProps<T extends InputTokenType | OutputTokenType> extends PoolListProps<T> {
  isLoading?: boolean;
  onClose: () => void;
  open: boolean;
}

interface PoolListProps<T extends InputTokenType | OutputTokenType> {
  definitions: { assetSymbol: string; type: T }[];
  onSelect: (tokenType: InputTokenType | OutputTokenType) => void;
  selected: InputTokenType | OutputTokenType | undefined;
}

export function PoolSelectorModal<T extends InputTokenType | OutputTokenType>({
  selected,
  isLoading,
  definitions,
  onSelect,
  onClose,
  open,
}: PoolSelectorModalProps<T>) {
  const content = isLoading ? (
    <Skeleton className="w-full h-10 mb-2" />
  ) : (
    <PoolList definitions={definitions} onSelect={onSelect} selected={selected} />
  );

  return <Dialog visible={open} onClose={onClose} headerText="Select a token" content={content} />;
}

function PoolList<T extends InputTokenType | OutputTokenType>({ onSelect, definitions, selected }: PoolListProps<T>) {
  const [_, setFilter] = useState<string>();
  return (
    <div className="relative">
      <Input
        bordered
        className="sticky top-0 z-10 w-full mb-8"
        onChange={(ev: ChangeEvent<HTMLInputElement>) => setFilter(ev.currentTarget.value)}
        placeholder="Find by name or address"
      />
      <div className="flex flex-col gap-1">
        {definitions.map(({ assetSymbol, type }) => (
          <PoolListItem
            key={type}
            isSelected={selected === assetSymbol}
            onSelect={onSelect}
            tokenType={type}
            tokenSymbol={assetSymbol}
          />
        ))}
      </div>
    </div>
  );
}
