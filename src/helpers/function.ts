/* eslint-disable @typescript-eslint/no-explicit-any */
export const debounce = <T extends any[]>(func: (...args: T) => any, timeout = 300) => {
  let timer: NodeJS.Timeout | undefined;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
};
