/* eslint-disable @typescript-eslint/no-explicit-any */
export const transformNumber = (value: any, originalValue: any) => {
  if (!originalValue) return value;
  if (typeof originalValue === 'string') value = Number(originalValue) ?? 0;
  return value;
};
