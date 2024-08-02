import { Avatar, AvatarProps, Button } from 'react-daisyui';
import { CheckIcon } from '@heroicons/react/20/solid';
import { useGetIcon } from '../../../hooks/useGetIcon';
import { InputTokenType, OutputTokenType } from '../../../constants/tokenConfig';

interface PoolListItemProps<T extends InputTokenType | OutputTokenType> {
  tokenType: T;
  tokenSymbol: string;
  isSelected?: boolean;
  onSelect: (tokenType: T) => void;
}

export function PoolListItem<T extends InputTokenType | OutputTokenType>({
  tokenType,
  tokenSymbol,
  isSelected,
  onSelect,
}: PoolListItemProps<T>) {
  const tokenIcon = useGetIcon(tokenType);

  return (
    <Button
      type="button"
      size="md"
      color="secondary"
      key={tokenSymbol}
      onClick={() => onSelect(tokenType)}
      className="items-center justify-start w-full h-auto gap-4 px-3 py-2 text-left border-0 bg-blackAlpha-200 hover:opacity-80 dark:bg-whiteAlpha-200"
    >
      <span className="relative">
        <Avatar size={'xs' as AvatarProps['size']} letters={tokenSymbol} src={tokenIcon} className="text-xs" />
        {isSelected && (
          <CheckIcon className="absolute -right-1 -top-1 w-5 h-5 p-[3px] text-white bg-green-600 rounded-full" />
        )}
      </span>
      <span className="flex flex-col">
        <span className="text-lg leading-5 dark:text-white">
          <strong>{tokenSymbol}</strong>
        </span>
        <span className="text-sm leading-5 text-neutral-500">{tokenSymbol}</span>
      </span>
    </Button>
  );
}
