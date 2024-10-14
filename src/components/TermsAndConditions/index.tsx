import { useState } from 'preact/compat';
import { Button, Checkbox, Link } from 'react-daisyui';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { Dialog } from '../Dialog';

export const TermsAndConditions = () => {
  const { set, state } = useLocalStorage<string | undefined>({ key: 'TERMS_AND_CONDITIONS' });
  const [checked, setChecked] = useState<boolean>(false);

  const acceptTerms = () => {
    set('accepted');
  };

  const content = (
    <>
      <div className="mb-5 text-lg">
        <Link
          style={{ textDecoration: 'underline' }}
          color="accent"
          target="_blank"
          rel="noreferrer"
          href="https://pendulumchain.org/legal/portal-terms-and-conditions"
        >
          View Terms and Conditions
        </Link>
      </div>
      <div className="flex text-lg">
        <Checkbox checked={checked} onClick={() => setChecked(!checked)} color="primary" size="md" />
        <span className="pl-2">I have read and accept the terms and conditions</span>
      </div>
    </>
  );

  const actions = (
    <Button className="w-full px-12 text-thin" color="primary" onClick={acceptTerms} disabled={!checked}>
      Agree
    </Button>
  );

  return (
    <Dialog
      content={content}
      headerText="T&Cs"
      visible={!state}
      actions={actions}
      hideCloseButton={true}
      disableNativeEvents={true}
    />
  );
};
