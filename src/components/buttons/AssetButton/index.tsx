import { FC } from 'preact/compat';
import { TokenDetails } from '../../../constants/tokenConfig';
import { useGetIcon } from '../../../hooks/useGetIcon';

interface AssetButtonProps {
  token?: TokenDetails;
  onClick: () => void;
}
export const AssetButton: FC<AssetButtonProps> = ({ token, onClick }) => {
  const icon = useGetIcon(token?.assetCode);

  return (
    <button
      className="flex items-center h-8 px-2 py-1 border border-blue-700 rounded-full hover:bg-blue-200 min-h-none"
      onClick={onClick}
      type="button"
    >
      <span className="h-full p-px rounded-full sm:mr-1">
        {token && <img src={icon} alt={token.assetCode} className="w-auto h-full" />}
      </span>
      <strong className="hidden font-bold text-black sm:block">{token?.assetCode || 'Select'}</strong>
    </button>
  );
};
