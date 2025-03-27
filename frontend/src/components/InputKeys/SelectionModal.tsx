import { useState } from 'react';
import { OnChainToken, FiatToken } from 'shared';
import { Dialog } from '../Dialog';
import { Skeleton } from '../Skeleton';
import { PoolListItem } from './PoolListItem';
import { AssetIconType } from '../../hooks/useGetAssetIcon';
import { SearchInput } from '../SearchInput';

interface PoolSelectorModalProps extends PoolListProps {
  isLoading?: boolean;
  onClose: () => void;
  open: boolean;
}

export interface TokenDefinition {
  assetSymbol: string;
  type: OnChainToken | FiatToken;
  assetIcon: string;
  name?: string;
}

interface PoolListProps {
  definitions: TokenDefinition[];
  onSelect: (tokenType: OnChainToken | FiatToken) => void;
  selected: OnChainToken | FiatToken;
}

export function PoolSelectorModal({
  selected,
  isLoading,
  definitions,
  onSelect,
  onClose,
  open,
}: PoolSelectorModalProps) {
  const content = isLoading ? (
    <Skeleton className="w-full h-10 mb-2" />
  ) : (
    <PoolList definitions={definitions} onSelect={onSelect} selected={selected} />
  );

  return <Dialog visible={open} onClose={onClose} headerText="Select a token" content={content} />;
}

function PoolList({ onSelect, definitions, selected }: PoolListProps) {
  const [filter, setFilter] = useState<string>('');

  const filteredDefinitions = definitions.filter(({ assetSymbol, name }) => {
    const searchTerm = filter.toLowerCase();
    return assetSymbol.toLowerCase().includes(searchTerm) || (name && name.toLowerCase().includes(searchTerm));
  });

  return (
    <div className="relative">
      <SearchInput set={setFilter} placeholder="Find by name or address" />
      <div className="flex flex-col gap-2 mt-5">
        {filteredDefinitions.map(({ assetIcon, assetSymbol, type, name }) => (
          <PoolListItem
            key={type}
            isSelected={selected === type}
            onSelect={onSelect}
            tokenType={type}
            tokenSymbol={assetSymbol}
            assetIcon={assetIcon}
            name={name}
          />
        ))}
      </div>
    </div>
  );
}
