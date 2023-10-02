import { HTMLAttributes } from 'preact/compat';

const StakingIcon = (props: HTMLAttributes<SVGSVGElement>) => (
  <svg width="32" height="32" {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="m16.41,8.12l4.73,3.68-4.73,3.68-4.73-3.68,4.73-3.68m0-2.53l-7.99,6.21,1.45,1.13,6.54,5.08,6.53-5.08,1.46-1.13-7.99-6.21h0Zm6.54,9.58s-6.55,5.09-6.55,5.09l-6.54-5.08-1.44,1.12,7.99,6.21,7.99-6.21-1.45-1.13h0Zm0,4.52s-6.55,5.09-6.55,5.09l-6.54-5.08-1.44,1.12,7.99,6.21,7.99-6.21-1.45-1.13h0Z" />
  </svg>
);

export default StakingIcon;
