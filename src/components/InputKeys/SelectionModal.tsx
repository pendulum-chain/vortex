import { Skeleton } from "../Skeleton";
import { Avatar, AvatarProps, Modal, Button, Input, ButtonProps } from 'react-daisyui';
import { ChangeEvent, useMemo, useState } from 'preact/compat';
import { CheckIcon } from '@heroicons/react/20/solid';
import { TOKEN_CONFIG, TokenDetails } from "../../constants/tokenConfig";

interface PoolSelectorModalProps extends PoolListProps {
    isLoading?: boolean;
    onClose: () => void;
    open: boolean;
}

export type PoolEntry = TokenDetails;

interface PoolListProps {
  type: string | undefined;
  onSelect: (pool: PoolEntry) => void;
  selected:
    | { type: 'token'; tokenAddress: string | undefined }
    | { type: 'backstopPool' }
    | { type: 'swapPool'; poolAddress: string };
}

export function PoolSelectorModal({
    selected,
    isLoading,
    onSelect,
    onClose,
    open,
    type,
  }: PoolSelectorModalProps) {
    return (
      <Modal className="bg-[--bg-modal]" open={open}>
        <Modal.Header className="mb-0">
          <ModalCloseButton onClick={onClose} />
          <h3 className="text-2xl font-normal">{'Select a token'}</h3>
        </Modal.Header>
        <Modal.Body>
          <div className="py-4">
            {isLoading ? (
              <Skeleton className="w-full h-10 mb-2" />
            ) : (
              <PoolList type={type} onSelect={onSelect} selected={selected} />
            )}
          </div>
        </Modal.Body>
      </Modal>
    );
  }


function PoolList({ onSelect, selected, type }: PoolListProps) {
    const [filter, setFilter] = useState<string>();
  
    const poolList = useMemo(() => {
      const poolList: PoolEntry[]=[];
       Object.keys(TOKEN_CONFIG).forEach((token) => {
        if (type === 'to' && !TOKEN_CONFIG[token].isOfframp)  return;
        poolList.push(TOKEN_CONFIG[token]);
      });

  
      return poolList;
    }, [ type]);
    
    return (
      <div className="relative">
        <Input
          bordered
          className="sticky top-0 w-full mb-8 z-10"
          onChange={(ev: ChangeEvent<HTMLInputElement>) => setFilter(ev.currentTarget.value)}
          placeholder="Find by name or address"
        />
        <div className="flex flex-col gap-1">
          {poolList?.map((poolEntry) => {
            const {assetCode  } = poolEntry;
            let isSelected;
            switch (selected.type) {
              case 'token':
                isSelected = selected.tokenAddress === assetCode;
                break;
            }
  
            return (
              <Button
                type="button"
                size="md"
                color="secondary"
                key={poolEntry.assetCode}
                onClick={() => onSelect(poolEntry)}
                className="w-full items-center justify-start gap-4 px-3 py-2 h-auto border-0 bg-blackAlpha-200 text-left hover:opacity-80 dark:bg-whiteAlpha-200"
              >
                <span className="relative">
                  <Avatar
                    size={'xs' as AvatarProps['size']}
                    letters={poolEntry.assetCode}
                    src={`/assets/coins/${poolEntry.assetCode.toUpperCase()}.png`}
                    shape="circle"
                    className="text-xs"
                  />
                  {isSelected && (
                    <CheckIcon className="absolute -right-1 -top-1 w-5 h-5 p-[3px] text-white bg-green-600 rounded-full" />
                  )}
                </span>
                <span className="flex flex-col">
                  <span className="text-lg dark:text-white leading-5">
                    <strong>
                      {poolEntry.assetCode}
                    </strong>
                  </span>
                  <span className="text-sm text-neutral-500 leading-5">{poolEntry.assetCode}</span>
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

const ModalCloseButton = (props: ButtonProps): JSX.Element | null => (
  <Button size="sm" color="secondary" shape="circle" className="absolute right-2 top-2" type="button" {...props}>
    ✕
  </Button>
);

export default ModalCloseButton;