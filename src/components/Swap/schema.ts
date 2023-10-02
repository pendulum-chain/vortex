import * as Yup from 'yup';
import { transformNumber } from '../../helpers/yup';
import { SwapFormValues } from './types';

const schema = Yup.object<SwapFormValues>().shape({
  from: Yup.string().min(3).required(),
  fromAmount: Yup.number().positive().required().transform(transformNumber),
  to: Yup.string().min(3).required(),
  toAmount: Yup.number().positive().required(),
  slippage: Yup.number().nullable().transform(transformNumber),
  deadline: Yup.number().nullable().transform(transformNumber),
});

export default schema;
