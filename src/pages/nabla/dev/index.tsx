import { useNavigate } from 'react-router-dom';
import { Token } from '../../../../gql/graphql';
import { useGlobalState } from '../../../GlobalStateProvider';
import { config } from '../../../config';
import { mockERC20 } from '../../../contracts/nabla/MockERC20';
import { useTokens } from '../../../hooks/nabla/useTokens';
import { decimalToNative } from '../../../shared/parseNumbers';
import { useContractWrite } from '../../../shared/useContractWrite';

const amount = decimalToNative(1000).toString();

const TokenItem = ({ token }: { token: Token }) => {
  const { address } = useGlobalState().walletAccount || {};
  const { mutate, isLoading } = useContractWrite({
    abi: mockERC20,
    address: token.id,
    method: 'mint',
    args: [address, amount],
    onError: console.error,
  });
  return (
    <div className="flex items-center justify-between gap-3" key={token.id}>
      <div>
        <p>{token.name}</p>
        <p className="w-full truncate text-xs text-gray-500">{token.id}</p>
      </div>
      <div>
        <button
          className={`btn btn-secondary btn-sm ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}
          onClick={() => mutate()}
        >
          {isLoading ? 'Loading' : 'Mint 1000'}
        </button>
      </div>
    </div>
  );
};

const DevPage = () => {
  const nav = useNavigate();
  const wallet = useGlobalState().walletAccount;
  const { data } = useTokens();
  const { tokens } = data || {};

  if (!config.isDev) nav('/');
  if (!wallet?.address) {
    return <>Please connect your wallet.</>;
  }
  return (
    <div className="my-6 flex flex-wrap items-start gap-4">
      <div className="card w-full max-w-[36rem] bg-base-200 shadow-xl">
        <div className="card-body">
          <h3 className="mb-2 text-2xl">Tokens</h3>
          {tokens?.map((token) => (
            <TokenItem key={token.id} token={token} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DevPage;
