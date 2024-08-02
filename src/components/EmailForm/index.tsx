import { useForm } from 'react-hook-form';
import { TextInput } from '../../components/TextInput';

export const EmailForm = () => {
  const { register } = useForm();

  return (
    <section className="w-full">
      <p className="font-light text-center text-blue-700">
        To receive further assistance and information about our app,
      </p>
      <p className="font-light text-center text-blue-700">please provide your email address below:</p>
      <div className="w-full mt-2">
        <TextInput type="email" placeholder="example@mail.com" register={register('email')} />
      </div>
    </section>
  );
};
