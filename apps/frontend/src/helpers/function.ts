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

export async function waitUntilTrue(test: () => Promise<boolean>, periodMs = 1000) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await test()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, periodMs));
  }
}
