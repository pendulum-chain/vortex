import * as Yup from 'yup';

export type SwapFormValues = {
  from: string;
  fromAmount: string;
  to: string;
  toAmount: string;
};

const schema = Yup.object<SwapFormValues>().shape({
  from: Yup.string().min(5).required(),
  fromAmount: Yup.string().required(),
  to: Yup.string().min(5).required(),
  toAmount: Yup.string().required(),
});

export default schema;
