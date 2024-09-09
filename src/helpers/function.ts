/* eslint-disable @typescript-eslint/no-explicit-any */
export const debounce = <T extends any[]>(func: (...args: T) => any, timeout = 300) => {
  let timer: NodeJS.Timeout | undefined;
  return (...args: T) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
};

export async function waitUntil(test: () => Promise<boolean>) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await test()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
