import {ChevronRightIcon} from '@heroicons/react/20/solid';
import {ComponentChildren} from 'preact';
import {HTMLAttributes} from 'preact/compat';
import {GlobalState} from '../../GlobalStateProvider';
import DashboardIcon from '../../assets/dashboard';
import SwapIcon from '../../assets/swap';
import TransactionIcon from "@heroicons/react/24/outline/ArrowsRightLeftIcon"
import AddressBookIcon from "@heroicons/react/24/solid/BookmarkSquareIcon"
import InvoiceGeneratorIcon from "@heroicons/react/24/solid/DocumentTextIcon"

export type LinkParameter = { isActive?: boolean };
export type BaseLinkItem = {
  link: string;
  title: ComponentChildren;
  props?: Omit<HTMLAttributes<HTMLAnchorElement>, 'className'> & {
    className?: (params?: LinkParameter) => string;
  };
  prefix?: ComponentChildren;
  suffix?: ComponentChildren;
  hidden?: boolean;
};
export type LinkItem = BaseLinkItem & {
  submenu?: BaseLinkItem[];
};
export type Links = (state: Partial<GlobalState>) => LinkItem[];

const arrow = <ChevronRightIcon className="nav-arrow w-5 h-5"/>;

export const links: Links = ({tenantName}) => [
  {
    link: './dashboard',
    title: 'Dashboard',
    props: {
      className: ({isActive} = {}) => (isActive ? 'active' : ''),
    },
    prefix: <DashboardIcon/>,
    suffix: arrow,
  },
  {
    link: './transactions',
    title: 'Transaction History',
    props: {
      className: ({isActive} = {}) => (isActive ? 'active' : 'coming-soon'),
    },
    prefix: <TransactionIcon className="p-1"/>,
    suffix: undefined
  },
  {
    link: './address-book',
    title: 'Address Book',
    props: {
      className: ({isActive} = {}) => (isActive ? 'active' : 'coming-soon'),
    },
    prefix: <AddressBookIcon className="p-1"/>,
    suffix: undefined
  },
  {
    link: './swap',
    title: 'Swap',
    props: {
      className: ({isActive} = {}) => (isActive ? 'active' : 'coming-soon'),
    },
    prefix: <SwapIcon className="p-1"/>,
    suffix: undefined
  },
  {
    link: './invoices',
    title: 'Invoice Generator',
    props: {
      className: ({isActive} = {}) => (isActive ? 'active' : 'coming-soon'),
    },
    prefix: <InvoiceGeneratorIcon className="p-1"/>,
    suffix: undefined
  },
];
