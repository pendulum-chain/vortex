import { Skeleton } from '../Skeleton';
import { Input } from 'react-daisyui';
import { ChangeEvent, useMemo, useState } from 'preact/compat';
import { TOKEN_CONFIG, TokenDetails, TokenType } from '../../constants/tokenConfig';
import { Dialog } from '../Dialog';
import { PoolListItem } from './PoolListItem';

interface PoolSelectorModalProps extends PoolListProps {
  isLoading?: boolean;
  onClose: () => void;
  open: boolean;
}

export interface SelectorMode {
  type: 'from' | 'to' | undefined;
  swap: boolean;
}

interface PoolListProps {
  mode: SelectorMode;
  onSelect: (pool: TokenDetails) => void;
  selected:
    | { type: 'token'; tokenAddress: string | undefined }
    | { type: 'backstopPool' }
    | { type: 'swapPool'; poolAddress: string };
}

export function PoolSelectorModal({ selected, isLoading, onSelect, onClose, open, mode }: PoolSelectorModalProps) {
  const content = isLoading ? (
    <Skeleton className="w-full h-10 mb-2" />
  ) : (
    <PoolList mode={mode} onSelect={onSelect} selected={selected} />
  );

  return <Dialog visible={open} onClose={onClose} headerText="Select a token" content={content} />;
}

function PoolList({ onSelect, selected, mode }: PoolListProps) {
  const [_, setFilter] = useState<string>();

  const poolList = useMemo(() => {
    const poolList: TokenDetails[] = [];
    (Object.keys(TOKEN_CONFIG) as TokenType[]).forEach((token) => {
      // special case rules
      // do not allow non-offramp tokens in the to field,
      if (mode.type === 'to' && mode.swap && !TOKEN_CONFIG[token].isOfframp) return;

      // only allow USDC asset code from otherChain property
      if (
        mode.type === 'from' &&
        mode.swap &&
        TOKEN_CONFIG[token].assetCode !== 'USDC' &&
        TOKEN_CONFIG[token].isPolygonChain !== true
      )
        return;

      // Do not allow non offrampable tokens in the from field if no swap
      if (mode.type === 'from' && !mode.swap && !TOKEN_CONFIG[token].isOfframp) return;

      poolList.push(TOKEN_CONFIG[token]);
    });

    return poolList;
  }, [mode]);

  return (
    <div className="relative">
      <Input
        bordered
        className="sticky top-0 z-10 w-full mb-8"
        onChange={(ev: ChangeEvent<HTMLInputElement>) => setFilter(ev.currentTarget.value)}
        placeholder="Find by name or address"
      />
      <div className="flex flex-col gap-1">
        {poolList?.map((tokenDetails) => {
          const { assetCode } = tokenDetails;
          let isSelected;
          switch (selected.type) {
            case 'token':
              isSelected = selected.tokenAddress === assetCode;
              break;
          }

          return (
            <PoolListItem key={assetCode} isSelected={isSelected} onSelect={onSelect} tokenDetails={tokenDetails} />
          );
        })}
      </div>
    </div>
  );
}
