import { HTMLAttributes } from 'preact/compat';

const DashboardIcon = (props: HTMLAttributes<SVGSVGElement>) => (
  <svg width="32" height="32" {...props} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="m23,9v2h-4v-2h4m-10,0v6h-4v-6h4m10,8v6h-4v-6h4m-10,4v2h-4v-2h4m12-14h-8v6h8v-6h0Zm-10,0H7v10h8V7h0Zm10,8h-8v10h8v-10h0Zm-10,4H7v6h8v-6h0Z" />
  </svg>
);

export default DashboardIcon;
