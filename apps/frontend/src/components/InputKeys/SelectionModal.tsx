import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  FiatToken,
  FiatTokenDetails,
  Networks,
  OnChainToken,
  OnChainTokenDetails,
  assetHubTokenConfig,
  evmTokenConfig,
  getEnumKeyByStringValue,
  moonbeamTokenConfig,
  stellarTokenConfig,
} from 'shared';
import { isFiatTokenDisabled } from '../../config/tokenAvailability';

import { useNetwork } from '../../contexts/network';
import { useOnchainTokenBalances } from '../../hooks/useOnchainTokenBalances';
import { useFiatToken, useOnChainToken, useRampFormStoreActions } from '../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { useRampModalActions } from '../../stores/rampModalStore';
import { useRampModalState } from '../../stores/rampModalStore';
import { Dialog } from '../Dialog';
import { RampDirection } from '../RampToggle';
import { SearchInput } from '../SearchInput';
import { Skeleton } from '../Skeleton';
import { PoolListItem } from './PoolListItem';

export interface TokenDefinition {
  assetSymbol: string;
  name?: string;
  assetIcon: string;
  type: OnChainToken | FiatToken;
  details: OnChainTokenDetails | FiatTokenDetails;
}

export function PoolSelectorModal() {
  const { t } = useTranslation();

  const { isOpen, isLoading } = useRampModalState();

  const { closeTokenSelectModal } = useRampModalActions();

  const content = isLoading ? <LoadingContent /> : <TokenSelectionList />;

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
  const { tokenSelectModalType } = useRampModalState();
  const { closeTokenSelectModal } = useRampModalActions();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { setFiatToken, setOnChainToken } = useRampFormStoreActions();
  const rampDirection = useRampDirection();

  const handleTokenSelect = (token: OnChainToken | FiatToken) => {
    const isFiatToken = Object.values(FiatToken).includes(token as FiatToken);
    if (isFiatToken && isFiatTokenDisabled(token as FiatToken)) {
      return;
    }

    if (rampDirection === RampDirection.ONRAMP) {
      if (tokenSelectModalType === 'from') {
        setFiatToken(token as FiatToken);
      } else {
        setOnChainToken(token as OnChainToken);
      }
    } else {
      if (tokenSelectModalType === 'from') {
        setOnChainToken(token as OnChainToken);
      } else {
        setFiatToken(token as FiatToken);
      }
    }
    closeTokenSelectModal();
  };

  const selectedToken =
    rampDirection === RampDirection.ONRAMP
      ? tokenSelectModalType === 'from'
        ? fiatToken
        : onChainToken
      : tokenSelectModalType === 'from'
        ? onChainToken
        : fiatToken;

  return (
    <div className="relative">
      <SearchInput set={setFilter} placeholder={t('components.dialogs.selectionModal.searchPlaceholder')} />
      <div className="flex flex-col gap-2 mt-5">
        {filteredDefinitions.map((token) => (
          <PoolListItem
            key={token.type}
            isSelected={selectedToken === token.type}
            onSelect={handleTokenSelect}
            token={token}
          />
        ))}
      </div>
    </div>
  );
}

function useTokenDefinitions(filter: string) {
  const { tokenSelectModalType } = useRampModalState();

  const { selectedNetwork } = useNetwork();

  const rampDirection = useRampDirection();

  const definitions = useMemo(
    () => getTokenDefinitionsForNetwork(tokenSelectModalType, rampDirection, selectedNetwork),
    [tokenSelectModalType, rampDirection, selectedNetwork],
  );

  const tokenDetails = useMemo(() => definitions.map((d) => d.details), [definitions]);
  const definitionsWithBalance = useOnchainTokenBalances(tokenDetails);

  const balanceMap = useMemo(() => {
    if (!definitionsWithBalance.length) return {};

    return definitionsWithBalance.reduce(
      (acc, token) => {
        acc[token.assetSymbol] = token.balance;
        return acc;
      },
      {} as Record<string, string>,
    );
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

function getOnChainTokensDefinitionsForNetwork(selectedNetwork: Networks) {
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

const getTokenDefinitionsForNetwork = (
  type: 'from' | 'to',
  direction: RampDirection,
  selectedNetwork: Networks,
): TokenDefinition[] => {
  const isOnramp = direction === RampDirection.ONRAMP;

  if (isOnramp) {
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
