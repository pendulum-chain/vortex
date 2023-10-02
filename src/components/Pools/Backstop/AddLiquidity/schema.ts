import * as Yup from 'yup';
import { transformNumber } from '../../../../helpers/yup';
import { AddLiquidityValues } from './types';

const schema = Yup.object<AddLiquidityValues>().shape({
  amount: Yup.number().positive().required().transform(transformNumber),
});

export default schema;
