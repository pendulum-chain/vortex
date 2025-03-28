import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  InputTokenType,
  OutputTokenType,
  InputTokenDetails,
  BaseOutputTokenDetails,
  isInputTokenType,
} from '../../constants/tokenConfig';
import { useInputTokenBalances } from '../../hooks/useInputTokenBalances';
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
  const tokens = useMemo(
    () => definitions.filter(({ type }) => isInputTokenType(type)).map(({ details }) => details),
    [definitions],
  ) as InputTokenDetails[];

  const definitionsWithBalance = useInputTokenBalances(tokens);

  const balanceMap = useMemo(() => {
    if (!definitionsWithBalance.length) return {};

    return definitionsWithBalance.reduce((acc, token) => {
      acc[token.assetSymbol] = token.balance;
      return acc;
    }, {} as Record<string, string>);
  }, [definitionsWithBalance]);

  const sortedDefinitions = useMemo(() => {
    if (!definitionsWithBalance.length) return definitions;

    return [...definitions].sort((a, b) => {
      const balanceA = balanceMap[a.assetSymbol] || '0';
      const balanceB = balanceMap[b.assetSymbol] || '0';
      return Number(balanceB) - Number(balanceA);
    });
  }, [definitions, balanceMap, definitionsWithBalance.length]);

  const filteredDefinitions = useMemo(() => {
    const searchTerm = filter.toLowerCase();
    return sortedDefinitions.filter(
      ({ assetSymbol, name }) =>
        assetSymbol.toLowerCase().includes(searchTerm) || (name && name.toLowerCase().includes(searchTerm)),
    );
  }, [sortedDefinitions, filter]);

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
