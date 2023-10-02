import type { HTMLAttributes } from 'preact/compat';

export type SpinnerProps = {
  size?: number;
} & HTMLAttributes<SVGSVGElement> &
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any;

const Spinner = ({ size = 24, ...rest }: SpinnerProps) => (
  <svg
    className="animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    {...rest}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray={110}
      strokeDashoffset={75}
    ></circle>
  </svg>
);

export default Spinner;
