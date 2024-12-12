import { Checkbox, Link } from 'react-daisyui';

interface TermsAndConditionsProps {
  toggleTermsChecked: (accepted: boolean) => void;
  termsChecked: boolean;
  termsAccepted: boolean;
}

export const TermsAndConditions = ({ toggleTermsChecked, termsChecked, termsAccepted }: TermsAndConditionsProps) => {
  if (termsAccepted) {
    return <></>;
  }

  return (
    <>
      <div className="mb-5 text-sm"></div>
      <div className="flex text-sm">
        <Checkbox checked={termsChecked} onClick={toggleTermsChecked} color="primary" size="sm" />
        <span className="pl-2">
          I have read and accept the{' '}
          <Link
            style={{ textDecoration: 'underline' }}
            color="accent"
            target="_blank"
            rel="noreferrer"
            href="https://www.vortexfinance.co/terms-conditions"
          >
            Terms and Conditions
          </Link>
        </span>
      </div>
    </>
  );
};
