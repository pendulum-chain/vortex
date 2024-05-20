/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'preact/compat';
import BigNumber from 'bn.js';

import { erc20WrapperAbi } from '../../contracts/ERC20Wrapper';
import { useGlobalState } from '../../GlobalStateProvider';
import { useErc20TokenAllowance } from './useERC20TokenAllowance';
import { UseContractWriteProps, UseContractWriteResponse, useContractWrite } from './useContractWrite';

export enum ApprovalState {
  UNKNOWN,
  LOADING,
  PENDING,
  NOT_APPROVED,
  APPROVED,
  NO_ACCOUNT,
}

interface UseErc20TokenApprovalParams {
  spender: string;
  token: string;
  decimalAmount: BigNumber | undefined;
  decimals: number;
  onError?: (err: any) => void;
  onSuccess?: UseContractWriteProps<Dict>['mutateOptions']['onSuccess'];
}

interface UseErc20TokenApprovalResult {
  state: ApprovalState;
  mutate: UseContractWriteResponse['mutate'];
}

export async function useErc20TokenApproval({
  token,
  decimalAmount,
  spender,
  decimals,
  onError,
  onSuccess,
}: UseErc20TokenApprovalParams): Promise<UseErc20TokenApprovalResult> {
    const globalState = useGlobalState();
    const address = globalState.walletAccount?.address;

    const [pending, setPending] = useState(false);

    const isEnabled = Boolean(spender && address);

    const {
        data: allowanceData,
        isLoading: isAllowanceLoading,
        refetch,
    } = await useErc20TokenAllowance({ token, owner: address, spender, decimals }, isEnabled);

    const mutation = await useContractWrite({
        abi: erc20WrapperAbi,
        address: token,
        method: 'approve',
        mutateOptions: {
        onError: (err) => {
            setPending(false);
            if (onError) onError(err);
        },
        onSuccess: (...args) => {
            setPending(true);
            if (onSuccess) onSuccess(...args);

            refetch();

            setTimeout(() => {
            refetch();
            setPending(false);
            }, 2000); // delay refetch as sometimes the allowance takes some time to reflect
        },
        },
    });

    const allowanceDecimalAmount = allowanceData?.preciseBigDecimal;

    return useMemo(() => {
        let state = ApprovalState.UNKNOWN;

        if (address === undefined) state = ApprovalState.NO_ACCOUNT;
        else if (isAllowanceLoading) state = ApprovalState.LOADING;
        else if (!mutation.isReady) state = ApprovalState.UNKNOWN;
        else if (
        allowanceDecimalAmount !== undefined &&
        decimalAmount !== undefined &&
        allowanceDecimalAmount.gte(decimalAmount)
        ) {
        state = ApprovalState.APPROVED;
        } else if (pending || mutation.isPending) state = ApprovalState.PENDING;
        else if (
        allowanceDecimalAmount !== undefined &&
        decimalAmount !== undefined &&
        allowanceDecimalAmount.lt(decimalAmount)
        ) {
        state = ApprovalState.NOT_APPROVED;
        }

        return { state, mutate: mutation.mutate };
    }, [allowanceDecimalAmount, decimalAmount, mutation, isAllowanceLoading, pending, address]);
}