import { useAccount, useSignMessage, useBalance } from 'wagmi';
import { useEffect } from 'preact/compat';

const polygonAddress = `0xCfB5ea41788c1d539b6Fd760CF26d688aE0331fF`;

export function useWagmiHooks() {
  const { address } = useAccount();

  const { signMessage } = useSignMessage();

  useEffect(() => {
    if (!address) return;

    signMessage(
      { message: 'Hello world' },
      {
        onSuccess: (data, variables, context) => {
          console.log('signMessage success', data);
        },
        onError: (error) => {
          console.error('signMessage error', error);
        },
      },
    );
  }, [address]);

  const balance = useBalance({ address: polygonAddress });
  console.log(`Balance of ${polygonAddress}:`, balance.data);
}
