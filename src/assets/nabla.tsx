import { HTMLAttributes } from 'preact/compat';

const NablaIcon = (props: HTMLAttributes<SVGSVGElement>) => (
  <svg
    width="32"
    height="32"
    fill="#32253e"
    fillRule="evenodd"
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
  >
    <path d="m25.26,5.71l1.25,8.42-8.63,12.17-3.45-.79-5.19-8.95-3.75-7.09,19.77-3.75Zm-1.11.97l-17.91,3.23,8.32,13.52,2.28.28,7.32-17.03Zm-4.8,3.82l-3.84,8.93-4.56-7.42,8.4-1.51Zm-.99,1.41l-3.73,1.65,1.19,3.81,2.54-5.46Z" />
  </svg>
);

export default NablaIcon;
