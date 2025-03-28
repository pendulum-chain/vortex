import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  InputTokenType,
  OutputTokenType,
  InputTokenDetails,
  BaseOutputTokenDetails,
} from '../../constants/tokenConfig';
import { AssetIconType } from '../../hooks/useGetAssetIcon';
import { PoolListItem } from './PoolListItem';
import { SearchInput } from '../SearchInput';
import { Skeleton } from '../Skeleton';
import { Dialog } from '../Dialog';

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
  details: InputTokenDetails | BaseOutputTokenDetails;
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
        {filteredDefinitions.map((token) => (
          <PoolListItem key={token.type} isSelected={selected === token.type} onSelect={onSelect} token={token} />
        ))}
      </div>
    </div>
  );
}
