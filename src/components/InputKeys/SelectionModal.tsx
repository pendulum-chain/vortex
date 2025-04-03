import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  InputTokenType,
  OutputTokenType,
  InputTokenDetails,
  BaseOutputTokenDetails,
  INPUT_TOKEN_CONFIG,
  getEnumKeyByStringValue,
  OUTPUT_TOKEN_CONFIG,
  OutputTokenTypes,
  isInputTokenType,
} from '../../constants/tokenConfig';
import { AssetIconType } from '../../hooks/useGetAssetIcon';
import { PoolListItem } from './PoolListItem';
import { SearchInput } from '../SearchInput';
import { Skeleton } from '../Skeleton';
import { Dialog } from '../Dialog';
import { useNetwork } from '../../contexts/network';
import { useInputTokenBalances } from '../../hooks/useInputTokenBalances';
import { useTokenSelection } from '../../stores/offrampStoreSecond';

export interface TokenDefinition {
  assetSymbol: string;
  type: InputTokenType | OutputTokenType;
  assetIcon: AssetIconType;
  name?: string;
  details: InputTokenDetails | BaseOutputTokenDetails;
}

export function PoolSelectorModal() {
  const { t } = useTranslation();
  const {
    isOpen,
    isLoading,
    tokenSelectModalType,
    selectedToken,
    closeTokenSelectModal,
    selectFromToken,
    selectToToken,
  } = useTokenSelection();

  // Handle token selection based on modal type
  const handleTokenSelect = (token: InputTokenType | OutputTokenType) => {
    if (tokenSelectModalType === 'from') {
      selectFromToken(token as InputTokenType);
    } else {
      selectToToken(token as OutputTokenType);
    }
  };

  const content = isLoading ? (
    <LoadingContent />
  ) : (
    <TokenSelectionList
      onSelect={handleTokenSelect}
      selected={selectedToken as InputTokenType | OutputTokenType}
      tokenSelectModalType={tokenSelectModalType}
    />
  );

  return (
    <Dialog
      visible={isOpen}
      onClose={closeTokenSelectModal}
      headerText={t('components.dialogs.selectionModal.title')}
      content={content}
    />
  );
}

function LoadingContent() {
  return <Skeleton className="w-full h-10 mb-2" />;
}

function TokenSelectionList({
  onSelect,
  selected,
  tokenSelectModalType,
}: {
  onSelect: (token: InputTokenType | OutputTokenType) => void;
  selected: InputTokenType | OutputTokenType;
  tokenSelectModalType: 'from' | 'to';
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>('');
  console.log('!!!fired TokenSelectionList');
  const { filteredDefinitions } = useTokenDefinitions(filter, tokenSelectModalType);

  return (
    <div className="relative">
      <SearchInput set={setFilter} placeholder={t('components.dialogs.selectionModal.searchPlaceholder')} />
      <div className="flex flex-col gap-2 mt-5">
        {filteredDefinitions.map((token) => (
          <PoolListItem
            key={token.type}
            isSelected={selected === token.type}
            onSelect={onSelect}
            tokenType={token.type}
            tokenSymbol={token.assetSymbol}
            assetIcon={token.assetIcon}
            name={token?.name || token.assetSymbol}
          />
        ))}
      </div>
    </div>
  );
}

function useTokenDefinitions(filter: string, tokenSelectModalType: 'from' | 'to') {
  const { selectedNetwork } = useNetwork();

  const definitions = useMemo(() => {
    if (tokenSelectModalType === 'from') {
      return getInputTokenDefinitions(selectedNetwork);
    } else {
      return getOutputTokenDefinitions();
    }
  }, [selectedNetwork, tokenSelectModalType]);

  const { balanceMap, definitionsWithBalance } = useTokenBalances(definitions);

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

  console.log('filteredDefinitions', filteredDefinitions);
  console.log('definitions', definitions);

  return { definitions, filteredDefinitions };
}

// @TODO: REMOVE
function useTokenBalances(definitions: TokenDefinition[]) {
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

  return { balanceMap, definitionsWithBalance };
}

function getInputTokenDefinitions(selectedNetwork: string) {
  return Object.entries(INPUT_TOKEN_CONFIG[selectedNetwork]).map(([key, value]) => ({
    type: key as InputTokenType,
    assetSymbol: (value as InputTokenDetails).assetSymbol,
    assetIcon: (value as InputTokenDetails).networkAssetIcon,
    details: value as InputTokenDetails,
  }));
}

function getOutputTokenDefinitions() {
  return Object.entries(OUTPUT_TOKEN_CONFIG).map(([key, value]) => ({
    type: getEnumKeyByStringValue(OutputTokenTypes, key) as OutputTokenType,
    assetSymbol: value.fiat.symbol,
    assetIcon: value.fiat.assetIcon,
    name: value.fiat.name,
    details: value as BaseOutputTokenDetails,
  }));
}
