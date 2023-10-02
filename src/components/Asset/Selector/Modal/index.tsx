import { CheckIcon } from '@heroicons/react/20/solid';
import { matchSorter } from 'match-sorter';
import { ChangeEvent, useMemo, useState } from 'preact/compat';
import { Avatar, Button, Input, Modal, ModalProps } from 'react-daisyui';
import { Token } from '../../../../../gql/graphql';
import { repeat } from '../../../../helpers/general';
import ModalCloseButton from '../../../Button/ModalClose';
import { Skeleton } from '../../../Skeleton';

export interface AssetListProps {
  assets?: Token[];
  onSelect: (asset: Token) => void;
  selected?: string;
}

const AssetList = ({ assets, onSelect, selected }: AssetListProps): JSX.Element | null => {
  const [filter, setFilter] = useState<string>();

  const filteredTokens = useMemo(
    () => (filter && assets ? matchSorter(assets, filter, { keys: ['name', 'address', 'symbol'] }) : assets),
    [assets, filter],
  );

  return (
    <>
      <Input
        bordered
        className="w-full mb-8"
        onChange={(ev: ChangeEvent<HTMLInputElement>) => setFilter(ev.currentTarget.value)}
        placeholder="Find by name or address"
      />
      <div className="flex flex-col gap-1">
        {filteredTokens?.map((token) => (
          <Button
            type="button"
            size="lg"
            variant="secondary"
            key={token.id}
            onClick={() => onSelect(token)}
            className="w-full items-center justify-start gap-4 px-3 py-1 border-0 bg-[rgba(0,0,0,.2)] text-left hover:opacity-80 dark:bg-[rgba(255,255,255,.12)]"
          >
            <span className="relative">
              <Avatar size="xs" letters={token.symbol} /* src={token.logoURI} */ shape="circle" className="text-xs" />
              {selected == token.id && (
                <CheckIcon className="absolute -right-1 -top-1 w-5 h-5 p-[3px] text-white bg-green-600 rounded-full" />
              )}
            </span>
            <span className="flex flex-col">
              <span className="text-lg leading-5">
                <strong>{token.symbol}</strong>
              </span>
              <span className="text-sm leading-5">{token.name}</span>
            </span>
          </Button>
        ))}
      </div>
    </>
  );
};

export type AssetSelectorModalProps = {
  isLoading?: boolean;
  onClose: () => void;
} & AssetListProps &
  Omit<ModalProps, 'onSelect' | 'selected'>;

export const AssetSelectorModal = ({
  assets,
  selected,
  isLoading,
  onSelect,
  onClose,
  ...rest
}: AssetSelectorModalProps) => {
  return (
    <Modal {...rest}>
      <Modal.Header className="mb-0">
        <ModalCloseButton onClick={onClose} />
        <h3 className="text-2xl font-normal">Select a token</h3>
      </Modal.Header>
      <Modal.Body>
        <div className="py-4">
          {isLoading ? (
            repeat(<Skeleton className="w-full h-10 mb-2" />)
          ) : (
            <AssetList assets={assets || []} onSelect={onSelect} selected={selected} />
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default AssetList;
