import { BackstopPool } from '../../../../../gql/graphql';

export const ModalTypes = {
  AddLiquidity: 2,
  WithdrawLiquidity: 3,
};

export type LiquidityModalProps = {
  data?: BackstopPool;
};
