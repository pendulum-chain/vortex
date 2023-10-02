import * as Yup from 'yup';
import { AddLiquidityValues } from './types';

const schema = Yup.object<AddLiquidityValues>().shape({
  amount: Yup.number().positive().required(),
});

export default schema;
