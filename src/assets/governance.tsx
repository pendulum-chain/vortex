import { HTMLAttributes } from 'preact/compat';

const GovernanceIcon = (props: HTMLAttributes<SVGSVGElement>) => (
  <svg width="32" height="32" {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="20.71 18.88 18.71 20.88 23.99 20.88 23.99 22.83 8.64 22.83 8.64 20.88 10.92 20.88 8.92 18.88 6.64 18.88 6.64 24.83 25.99 24.83 25.99 18.88 20.71 18.88" />
    <path d="m17.15,8.99l3.99,3.99-6.05,6.05-3.99-3.99,6.05-6.05m0-2.83l-8.88,8.88,6.82,6.82,8.88-8.88-6.82-6.82h0Z" />
  </svg>
);

export default GovernanceIcon;
