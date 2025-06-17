export const debounce = <T extends unknown[]>(func: (...args: T) => void, timeout = 300) => {
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
  while (true) {
    if (await test()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, periodMs));
  }
}
