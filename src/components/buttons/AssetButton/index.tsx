import { FC } from 'preact/compat';
import { TokenDetails } from '../../../constants/tokenConfig';
import { useGetIcon } from '../../../hooks/useGetIcon';

interface AssetButtonProps {
  token?: TokenDetails;
  onClick: () => void;
}
export const AssetButton: FC<AssetButtonProps> = ({ token, onClick }) => {
  const icon = useGetIcon(token?.assetCode.toUpperCase());

  return (
    <button
      className="hover:bg-blue-200 absolute z-20 translate-y-1/2 bottom-1/2 left-2 rounded-full min-h-none h-8 flex items-center mt-0.5 border border-blue-700 px-2 py-1 pr-3"
      onClick={onClick}
      type="button"
    >
      <span className="h-full p-px mr-1 rounded-full">
        {token && <img src={icon} alt={token.assetCode} className="w-auto h-full" />}
      </span>
      <strong className="font-bold text-black">{token?.assetCode || 'Select'}</strong>
    </button>
  );
};
