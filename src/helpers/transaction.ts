import { config } from '../config';

const { slippage, deadline } = config.transaction.settings;

export function getValidSlippage(val: number): number;
export function getValidSlippage(val: number | undefined): number | undefined;

export function getValidSlippage(val: number | undefined): number | undefined {
  return val !== undefined ? Math.min(Math.max(val, slippage.min), slippage.max) : val;
}

export function getValidDeadline(val: number): number {
  return Math.min(Math.max(val, deadline.min), deadline.max);
}
