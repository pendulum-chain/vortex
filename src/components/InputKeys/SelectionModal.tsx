import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';
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
  type: InputTokenType | OutputTokenType;
  assetIcon: AssetIconType;
  name?: string;
}

interface PoolListProps {
  definitions: TokenDefinition[];
  onSelect: (tokenType: InputTokenType | OutputTokenType) => void;
  selected: InputTokenType | OutputTokenType;
}

export function PoolSelectorModal({
  selected,
  isLoading,
  definitions,
  onSelect,
  onClose,
  open,
}: PoolSelectorModalProps) {
  const { t } = useTranslation();

  const content = isLoading ? (
    <Skeleton className="w-full h-10 mb-2" />
  ) : (
    <PoolList definitions={definitions} onSelect={onSelect} selected={selected} />
  );

  return (
    <Dialog
      visible={open}
      onClose={onClose}
      headerText={t('components.dialogs.selectionModal.title')}
      content={content}
    />
  );
}

function PoolList({ onSelect, definitions, selected }: PoolListProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>('');

  const filteredDefinitions = definitions.filter(({ assetSymbol, name }) => {
    const searchTerm = filter.toLowerCase();
    return assetSymbol.toLowerCase().includes(searchTerm) || (name && name.toLowerCase().includes(searchTerm));
  });

  return (
    <div className="relative">
      <SearchInput set={setFilter} placeholder={t('components.dialogs.selectionModal.searchPlaceholder')} />
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
