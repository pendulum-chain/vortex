/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { ApiPromise } from '@polkadot/api';
import { SubmittableResultValue } from '@polkadot/api-base/types';
import { Abi, ContractPromise } from '@polkadot/api-contract';
import { ContractOptions } from '@polkadot/api-contract/types';
import { DispatchError, ExtrinsicStatus } from '@polkadot/types/interfaces';
import { MutationOptions, useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'preact/compat';
import { createWriteOptions } from '../services/api/helpers';
import { useSharedState } from './Provider';
import { parseTransactionError } from './helpers';

// TODO: fix/improve types
export type TransactionsStatus = {
  hex?: string;
  status?: ExtrinsicStatus['type'] | 'Pending';
};

export type UseContractWriteProps<TAbi extends Abi | Record<string, unknown> = Record<string, unknown>> = Partial<
  MutationOptions<TransactionsStatus | undefined, DispatchError, any[] | void>
> & {
  abi: TAbi;
  address?: string;
  method: string;
  args?: any[];
  options?: ContractOptions | ((api: ApiPromise) => ContractOptions);
};

export const useContractWrite = <TAbi extends Abi | Record<string, unknown>>({
  abi,
  address,
  method,
  args,
  options,
  ...rest
}: UseContractWriteProps<TAbi>) => {
  const { api, signer, address: walletAddress } = useSharedState();

  const [transaction, setTransaction] = useState<TransactionsStatus | undefined>();
  const contract = useMemo(
    () => (api && address ? new ContractPromise(api, abi, address) : undefined),
    [abi, address, api],
  );
  const isReady = !!contract && !!api && !!walletAddress && !!signer;
  const submit = async (submitArgs?: any[] | void) => {
    if (!isReady) throw undefined;
    setTransaction({ status: 'Pending' });
    const fnArgs = submitArgs || args || [];
    const contractOptions = (typeof options === 'function' ? options(api) : options) || createWriteOptions(api);

    return new Promise<TransactionsStatus | undefined>((resolve, reject) => {
      const unsubPromise = contract.tx[method](contractOptions || {}, ...fnArgs)
        .signAndSend(walletAddress, { signer }, (result: SubmittableResultValue) => {
          const tx = {
            hex: result.txHash.toHex(),
            status: result.status.type,
          };
          setTransaction(tx);
          if (result.dispatchError) {
            parseTransactionError(result, api);
            reject(result);
          }
          if (result.status.isFinalized) {
            if (unsubPromise) {
              unsubPromise.then((unsub) => (typeof unsub === 'function' ? unsub() : undefined));
            }
            resolve(tx);
          }
        })
        .catch((err: Error) => {
          console.error(err);
          setTransaction(undefined);
          reject(err);
        });
    });
  };
  const mutation = useMutation(submit, rest);
  return { ...mutation, data: transaction, isReady };
};
