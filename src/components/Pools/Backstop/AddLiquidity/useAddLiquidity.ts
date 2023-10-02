import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { backstopPoolAbi } from '../../../../contracts/nabla/BackstopPool';
import { useModalToggle } from '../../../../services/modal';
import { decimalToNative } from '../../../../shared/parseNumbers';
import { useContractBalance } from '../../../../shared/useContractBalance';
import { useContractWrite } from '../../../../shared/useContractWrite';
import schema from './schema';
import { AddLiquidityValues } from './types';

export const useAddLiquidity = (poolAddress: string, tokenAddress: string) => {
  const toggle = useModalToggle();

  const balanceQuery = useContractBalance({ contractAddress: tokenAddress });
  const depositQuery = useContractBalance({ contractAddress: poolAddress });

  const form = useForm<AddLiquidityValues>({
    resolver: yupResolver(schema),
    defaultValues: {},
  });

  const mutation = useContractWrite({
    abi: backstopPoolAbi,
    address: poolAddress,
    method: 'deposit',
    onError: () => {
      // ? log error - alert not needed as the transaction modal dispays the error
    },
    onSuccess: () => {
      balanceQuery.refetch();
      depositQuery.refetch();
    },
  });

  const onSubmit = form.handleSubmit((variables: AddLiquidityValues) =>
    mutation.mutate([decimalToNative(variables.amount).toString()]),
  );

  return { form, mutation, onSubmit, toggle, balanceQuery, depositQuery };
};
