import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { backstopPoolAbi } from '../../../../contracts/nabla/BackstopPool';
import { calcPercentage } from '../../../../helpers/calc';
import { useModalToggle } from '../../../../services/modal';
import { decimalToNative } from '../../../../shared/parseNumbers';
import { useContractBalance } from '../../../../shared/useContractBalance';
import { useContractWrite } from '../../../../shared/useContractWrite';
import schema from './schema';
import { WithdrawLiquidityValues } from './types';

export const useWithdrawLiquidity = (poolAddress: string, tokenAddress: string) => {
  const toggle = useModalToggle();

  const balanceQuery = useContractBalance({ contractAddress: tokenAddress });
  const depositQuery = useContractBalance({ contractAddress: poolAddress });

  const form = useForm<WithdrawLiquidityValues>({
    resolver: yupResolver(schema),
    defaultValues: {},
  });

  const mutation = useContractWrite({
    abi: backstopPoolAbi,
    address: poolAddress,
    method: 'withdraw',
    onError: () => {
      // ? log error - alert not needed as the transaction modal dispays the error
    },
    onSuccess: () => {
      balanceQuery.refetch();
      depositQuery.refetch();
    },
  });

  const onSubmit = form.handleSubmit((variables: WithdrawLiquidityValues) =>
    mutation.mutate([
      decimalToNative(variables.amount).toString(),
      decimalToNative(calcPercentage(variables.amount, 0.1)).toString(),
    ]),
  );

  return { form, mutation, onSubmit, toggle, balanceQuery, depositQuery };
};
