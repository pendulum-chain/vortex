import { PropsWithChildren, useState } from 'preact/compat';
import { Button, Checkbox, Link, Modal } from 'react-daisyui';
import { useLocalStorage } from './hooks/useLocalStorage';

const TermsAndConditions = (_props: PropsWithChildren) => {
  const { state, set } = useLocalStorage<string | undefined>({ key: 'termsAndConditions' });
  const [checked, setChecked] = useState<boolean>(false);

  const acceptTerms = () => {
    set('accepted');
  };

  return state ? (
    <></>
  ) : (
    <Modal open={true} style={{ borderRadius: '5px' }}>
      <Modal.Header className="text-3xl">T&Cs</Modal.Header>
      <Modal.Body>
        <div className="text-lg mb-5">
          <Link
            style={{ textDecoration: 'underline' }}
            color="accent"
            target="_blank"
            href="https://pendulumchain.org/legal/portal-terms-and-conditions"
          >
            View Terms and Conditions
          </Link>
        </div>
        <div className="text-lg flex">
          <Checkbox checked={checked} onClick={() => setChecked(!checked)} color="primary" size="md" />
          <span className="pl-2">I have read and accept the terms and conditions</span>
        </div>
      </Modal.Body>
      <Modal.Actions className="justify-center mt-10">
        <Button className="px-12 text-thin w-full" color="primary" onClick={acceptTerms} disabled={!checked}>
          Agree
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default TermsAndConditions;
