import * as Yup from 'yup';
import { WithdrawLiquidityValues } from './types';

const schema = Yup.object<WithdrawLiquidityValues>().shape({
  amount: Yup.number().min(0).max(100).required(),
});

export default schema;
