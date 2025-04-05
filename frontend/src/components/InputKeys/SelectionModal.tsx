import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { assetHubTokenConfig, evmTokenConfig, FiatToken, FiatTokenDetails, getEnumKeyByStringValue, moonbeamTokenConfig, Networks, OnChainToken, OnChainTokenDetails, stellarTokenConfig } from 'shared';

import { useRampModalActions, useRampModalState } from '../../stores/rampModalStore';
import { useSwapDirection } from '../../stores/rampDirectionStore';
import { useNetwork } from '../../contexts/network';
import { PoolListItem } from './PoolListItem';
import { SearchInput } from '../SearchInput';
import { Skeleton } from '../Skeleton';
import { Dialog } from '../Dialog';
import { useOnchainTokenBalances } from '../../hooks/useOnchainTokenBalances';
import { SwapDirection } from '../Swap/SwapToggle';

export interface TokenDefinition {
  assetSymbol: string;
  name?: string;
  assetIcon: string;
  type: OnChainToken | FiatToken;
  details: OnChainTokenDetails | FiatTokenDetails;
}

export function PoolSelectorModal() {
  const { t } = useTranslation();

  const {
    isOpen,
    isLoading,
  } = useRampModalState();

  const {  closeTokenSelectModal } = useRampModalActions();



  const content = isLoading ? (
    <LoadingContent />
  ) : (
    <TokenSelectionList/>
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

function TokenSelectionList() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>('');
  const { filteredDefinitions } = useTokenDefinitions(filter);

  const {
    tokenSelectModalType,
    fromToken,
    toToken,
  } = useRampModalState();

  const { selectFromToken, selectToToken } = useRampModalActions();

  const handleTokenSelect = (token: OnChainToken | FiatToken) => {
    if (tokenSelectModalType === 'from') {
      selectFromToken(token);
    } else {
      selectToToken(token);
    }
  };

  const selectedToken = tokenSelectModalType === 'from' ? fromToken : toToken;

  return (
    <div className="relative">
      <SearchInput set={setFilter} placeholder={t('components.dialogs.selectionModal.searchPlaceholder')} />
      <div className="flex flex-col gap-2 mt-5">
        {filteredDefinitions.map((token) => (
          <PoolListItem key={token.type} isSelected={selectedToken === token.type} onSelect={handleTokenSelect} token={token} />
        ))}
      </div>
    </div>
  );
}

function useTokenDefinitions(filter: string) {
  const {
    tokenSelectModalType,
  } = useRampModalState();

  const { selectedNetwork } = useNetwork();

  const swapDirection = useSwapDirection();

  const definitions = useMemo(() =>
    getTokenDefinitionsForNetwork(tokenSelectModalType, swapDirection, selectedNetwork),
    [tokenSelectModalType, swapDirection, selectedNetwork]
  );

  const definitionsWithBalance = useOnchainTokenBalances(definitions.map(d => d.details));

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

  return { definitions, filteredDefinitions };
}


function getOnChainTokensDefinitionsForNetwork(selectedNetwork: Networks){
  if (selectedNetwork === Networks.AssetHub) {
    return Object.entries(assetHubTokenConfig).map(([key, value]) => ({
      type: key as OnChainToken,
      assetSymbol: value.assetSymbol,
      assetIcon: value.networkAssetIcon,
      details: value as OnChainTokenDetails,
    }));
  }

  return Object.entries(evmTokenConfig[selectedNetwork]).map(([key, value]) => ({
    type: key as OnChainToken,
    assetSymbol: value.assetSymbol,
    assetIcon: value.networkAssetIcon,
    details: value as OnChainTokenDetails,
  }));
}

const getTokenDefinitionsForNetwork = (type: 'from' | 'to', direction: SwapDirection, selectedNetwork: Networks): TokenDefinition[] => {

  const isOnramp = direction === SwapDirection.ONRAMP;

  if(isOnramp){
    if (type === 'from') {
      // @TODO: RESTRICT IT TO BRLA ONLY
      return Object.entries(moonbeamTokenConfig).map(([key, value]) => ({
        type: getEnumKeyByStringValue(FiatToken, key) as FiatToken,
        assetSymbol: value.fiat.symbol,
        assetIcon: value.fiat.assetIcon,
        name: value.fiat.name,
        details: value as FiatTokenDetails,
      }));
    }

    return getOnChainTokensDefinitionsForNetwork(selectedNetwork);
  }

  if (type === 'from') {
    return getOnChainTokensDefinitionsForNetwork(selectedNetwork);
  } else {
    return [...Object.entries(moonbeamTokenConfig), ...Object.entries(stellarTokenConfig)].map(([key, value]) => ({
      type: getEnumKeyByStringValue(FiatToken, key) as FiatToken,
      assetSymbol: value.fiat.symbol,
      assetIcon: value.fiat.assetIcon,
      name: value.fiat.name,
      details: value as FiatTokenDetails,
    }));
  }
};